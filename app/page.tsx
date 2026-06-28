"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getAddress,
  getNetworkDetails,
  isConnected,
  requestAccess,
  signTransaction,
} from "@stellar/freighter-api";
import { Networks } from "@stellar/stellar-sdk/minimal";
import {
  buildExplorerUrl,
  buildPaymentTransaction,
  fetchXlmBalance,
  formatErrorMessage,
  inspectSignedTransaction,
  shortenAddress,
  submitSignedTransaction,
  validateStellarPublicKey,
  type BalanceResult,
} from "@/lib/stellar";

type TransactionResult =
  | { status: "success"; hash: string }
  | { status: "error"; message: string };

type FreighterSignOptions = Parameters<typeof signTransaction>[1] & {
  accountToSign?: string;
};

export default function Home() {
  const [freighterInstalled, setFreighterInstalled] = useState<boolean | null>(
    null,
  );
  const [publicKey, setPublicKey] = useState("");
  const [balance, setBalance] = useState<BalanceResult | null>(null);
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [walletMessage, setWalletMessage] = useState("");
  const [formError, setFormError] = useState("");
  const [copyLabel, setCopyLabel] = useState("Copy address");
  const [transactionResult, setTransactionResult] =
    useState<TransactionResult | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [sending, setSending] = useState(false);

  const connected = Boolean(publicKey);

  const loadBalance = useCallback(async (address: string) => {
    setBalanceLoading(true);
    try {
      setBalance(await fetchXlmBalance(address));
    } catch (error) {
      setTransactionResult({
        status: "error",
        message: formatErrorMessage(error),
      });
    } finally {
      setBalanceLoading(false);
    }
  }, []);

  useEffect(() => {
    async function detectFreighter() {
      const connection = await isConnected();
      setFreighterInstalled(connection.isConnected);

      if (!connection.isConnected) {
        return;
      }

      const currentAddress = await getAddress();
      if (currentAddress.address) {
        setPublicKey(currentAddress.address);
        await loadBalance(currentAddress.address);
      }
    }

    void detectFreighter();
  }, [loadBalance]);

  const shortPublicKey = useMemo(
    () => (publicKey ? shortenAddress(publicKey) : ""),
    [publicKey],
  );

  async function connectWallet() {
    setConnecting(true);
    setWalletMessage("");
    setTransactionResult(null);

    try {
      const connection = await isConnected();
      setFreighterInstalled(connection.isConnected);

      if (!connection.isConnected) {
        setWalletMessage("Freighter wallet bulunamadı. Lütfen Freighter kurun.");
        return;
      }

      const access = await requestAccess();
      if (access.error || !access.address) {
        throw new Error(
          access.error?.message || "Freighter wallet bağlantısı onaylanmadı.",
        );
      }

      setPublicKey(access.address);
      await loadBalance(access.address);
    } catch (error) {
      setWalletMessage(formatErrorMessage(error));
    } finally {
      setConnecting(false);
    }
  }

  function disconnectWallet() {
    setPublicKey("");
    setBalance(null);
    setRecipient("");
    setAmount("");
    setFormError("");
    setWalletMessage("");
    setTransactionResult(null);
    setCopyLabel("Copy address");
  }

  async function copyAddress() {
    if (!publicKey) {
      return;
    }

    await navigator.clipboard.writeText(publicKey);
    setCopyLabel("Copied");
    window.setTimeout(() => setCopyLabel("Copy address"), 1500);
  }

  function validateForm() {
    if (!publicKey) {
      return "Wallet bağlı değil.";
    }

    if (!recipient.trim()) {
      return "Recipient address boş olamaz.";
    }

    if (!validateStellarPublicKey(recipient.trim())) {
      return "Recipient geçerli bir Stellar public key değil.";
    }

    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return "Amount pozitif bir sayı olmalı.";
    }

    return "";
  }

  async function sendPayment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    setTransactionResult(null);

    const validationError = validateForm();
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setSending(true);
    try {
      const networkDetails = await getNetworkDetails();
      if (
        networkDetails.error ||
        networkDetails.networkPassphrase !== Networks.TESTNET
      ) {
        throw new Error("Freighter network ayarını Stellar Testnet olarak seçin.");
      }

      const transaction = await buildPaymentTransaction({
        sourcePublicKey: publicKey,
        recipient: recipient.trim(),
        amount: Number(amount).toFixed(7),
      });

      const signed = await signTransaction(transaction.toXDR(), {
        networkPassphrase: Networks.TESTNET,
        accountToSign: publicKey,
      } as FreighterSignOptions);

      if (signed.error || !signed.signedTxXdr) {
        throw new Error(
          signed.error?.message || "Transaction Freighter ile imzalanamadı.",
        );
      }

      if (signed.signerAddress && signed.signerAddress !== publicKey) {
        throw new Error(
          "Freighter farklı bir account ile imzaladı. Wallet bağlantısını kesip doğru hesapla tekrar bağlanın.",
        );
      }

      const signedInfo = inspectSignedTransaction(signed.signedTxXdr);
      if (signedInfo.source !== publicKey || signedInfo.signatureCount === 0) {
        throw new Error(
          "Transaction connected wallet tarafından imzalanmadı. Freighter hesabını kontrol edip tekrar deneyin.",
        );
      }

      const submitted = await submitSignedTransaction(signed.signedTxXdr);
      setTransactionResult({ status: "success", hash: submitted.hash });
      await loadBalance(publicKey);
    } catch (error) {
      setTransactionResult({
        status: "error",
        message: formatErrorMessage(error),
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-6 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-normal text-slate-950 sm:text-4xl">
            Stellar Testnet Pay
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Freighter ile Stellar Testnet üzerinde basit XLM ödemesi gönderin.
          </p>
        </div>
        <span className="w-fit rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-sm font-semibold text-teal-800">
          Testnet only
        </span>
      </header>

      {freighterInstalled === false ? (
        <section className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Freighter wallet bulunamadı. Bu dApp secret key veya seed istemez;
          işlem imzası için Freighter tarayıcı eklentisi gerekir.
        </section>
      ) : null}

      <section className="grid flex-1 gap-5 py-6 lg:grid-cols-[1fr_1fr]">
        <article className="rounded-lg border border-slate-200 bg-white/90 p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">
                Wallet Card
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Freighter bağlantısı ve public key bilgisi.
              </p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            {!connected ? (
              <button
                className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                disabled={connecting}
                onClick={connectWallet}
                type="button"
              >
                {connecting ? "Connecting..." : "Connect Wallet"}
              </button>
            ) : (
              <button
                className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-100"
                onClick={disconnectWallet}
                type="button"
              >
                Disconnect
              </button>
            )}
          </div>

          {walletMessage ? (
            <p className="mt-4 rounded-md bg-rose-50 p-3 text-sm text-rose-800">
              {walletMessage}
            </p>
          ) : null}

          {connected ? (
            <div className="mt-5 rounded-lg bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Connected public key
              </p>
              <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <code className="break-all text-sm font-semibold text-slate-950">
                  {shortPublicKey}
                </code>
                <button
                  className="w-fit rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                  onClick={copyAddress}
                  type="button"
                >
                  {copyLabel}
                </button>
              </div>
            </div>
          ) : null}
        </article>

        <article className="rounded-lg border border-slate-200 bg-white/90 p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">
                Balance Card
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Horizon testnet üzerinden native XLM bakiyesi.
              </p>
            </div>
            <button
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!connected || balanceLoading}
              onClick={() => void loadBalance(publicKey)}
              type="button"
            >
              Refresh balance
            </button>
          </div>

          <div className="mt-6 rounded-lg bg-slate-950 p-5 text-white">
            <p className="text-sm text-slate-300">XLM balance</p>
            <p className="mt-2 text-3xl font-semibold">
              {balanceLoading
                ? "Loading..."
                : balance?.status === "funded"
                  ? `${Number(balance.balance).toLocaleString(undefined, {
                      maximumFractionDigits: 7,
                    })} XLM`
                  : "--"}
            </p>
          </div>

          {!connected ? (
            <p className="mt-4 text-sm text-slate-600">
              Bakiye görmek için wallet bağlayın.
            </p>
          ) : null}

          {balance?.status === "unfunded" ? (
            <p className="mt-4 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
              Bu hesap testnet üzerinde henüz fund edilmemiş olabilir.
            </p>
          ) : null}
        </article>

        <article className="rounded-lg border border-slate-200 bg-white/90 p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">
            Send Payment Card
          </h2>
          <form className="mt-5 space-y-4" onSubmit={sendPayment}>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">
                Recipient address
              </span>
              <input
                className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-3 text-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                onChange={(event) => setRecipient(event.target.value)}
                placeholder="G..."
                value={recipient}
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-700">Amount</span>
              <input
                className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-3 text-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                inputMode="decimal"
                min="0"
                onChange={(event) => setAmount(event.target.value)}
                placeholder="10.0000000"
                step="0.0000001"
                type="number"
                value={amount}
              />
            </label>

            {formError ? (
              <p className="rounded-md bg-rose-50 p-3 text-sm text-rose-800">
                {formError}
              </p>
            ) : null}

            <button
              className="w-full rounded-md bg-teal-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-400"
              disabled={sending}
              type="submit"
            >
              {sending ? "Sending..." : "Send XLM"}
            </button>
          </form>
        </article>

        <article className="rounded-lg border border-slate-200 bg-white/90 p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">
            Transaction Result Card
          </h2>

          <div className="mt-5 min-h-40 rounded-lg border border-dashed border-slate-300 p-4">
            {!transactionResult ? (
              <p className="text-sm text-slate-600">
                Transaction sonucu burada gösterilecek.
              </p>
            ) : null}

            {transactionResult?.status === "success" ? (
              <div className="space-y-3">
                <p className="font-semibold text-emerald-700">
                  Transaction successful
                </p>
                <div>
                  <p className="text-sm font-medium text-slate-700">
                    Transaction hash
                  </p>
                  <code className="mt-1 block break-all rounded-md bg-slate-50 p-3 text-sm text-slate-900">
                    {transactionResult.hash}
                  </code>
                </div>
                <a
                  className="inline-flex rounded-md border border-teal-200 bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-800 transition hover:bg-teal-100"
                  href={buildExplorerUrl(transactionResult.hash)}
                  rel="noreferrer"
                  target="_blank"
                >
                  Open in Stellar Expert
                </a>
              </div>
            ) : null}

            {transactionResult?.status === "error" ? (
              <div className="space-y-3">
                <p className="font-semibold text-rose-700">
                  Transaction failed
                </p>
                <p className="rounded-md bg-rose-50 p-3 text-sm text-rose-800">
                  {transactionResult.message}
                </p>
              </div>
            ) : null}
          </div>
        </article>
      </section>

      <footer className="border-t border-slate-200 py-5 text-center text-sm text-slate-600">
        Built for Stellar Level 1 White Belt
      </footer>
    </main>
  );
}
