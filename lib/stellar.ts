import {
  Asset,
  Horizon,
  Keypair,
  Memo,
  Networks,
  Operation,
  TransactionBuilder,
} from "@stellar/stellar-sdk/minimal";

export const HORIZON_TESTNET_URL = "https://horizon-testnet.stellar.org";
export const STELLAR_EXPERT_TESTNET_URL =
  "https://stellar.expert/explorer/testnet";
export const BASE_FEE = "100";

export type BalanceResult =
  | { status: "funded"; balance: string }
  | { status: "unfunded"; balance: null };

export type SignedTransactionInfo = {
  signatureCount: number;
  source: string;
};

export function shortenAddress(address: string, front = 6, back = 5) {
  if (address.length <= front + back + 3) {
    return address;
  }

  return `${address.slice(0, front)}...${address.slice(-back)}`;
}

export function validateStellarPublicKey(value: string) {
  try {
    return Keypair.fromPublicKey(value.trim()).publicKey() === value.trim();
  } catch {
    return false;
  }
}

export function buildExplorerUrl(hash: string) {
  return `${STELLAR_EXPERT_TESTNET_URL}/tx/${hash}`;
}

function formatHorizonResultCodes(resultCodes: unknown) {
  const transaction =
    typeof resultCodes === "object" &&
    resultCodes !== null &&
    "transaction" in resultCodes
      ? (resultCodes as { transaction?: string }).transaction
      : undefined;
  const operations =
    typeof resultCodes === "object" &&
    resultCodes !== null &&
    "operations" in resultCodes &&
    Array.isArray((resultCodes as { operations?: unknown }).operations)
      ? (resultCodes as { operations: string[] }).operations
      : [];

  if (transaction === "tx_bad_auth") {
    return "Transaction was not signed by the connected source wallet. Reconnect Freighter, make sure the connected account is active, and try again.";
  }

  if (operations.includes("op_no_destination")) {
    return "Recipient account is not active on Stellar Testnet. Fund the recipient account first, then try again.";
  }

  if (operations.includes("op_underfunded")) {
    return "Source account does not have enough XLM for this payment and network fee.";
  }

  if (operations.includes("op_malformed")) {
    return "Payment details are invalid. Check the recipient address and amount.";
  }

  return `Stellar Horizon rejected the transaction: ${JSON.stringify(
    resultCodes,
  )}`;
}

export function formatErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  if (typeof error === "object" && error !== null) {
    const maybeError = error as {
      message?: string;
      response?: {
        data?: {
          title?: string;
          detail?: string;
          extras?: { result_codes?: unknown };
        };
      };
    };

    if (maybeError.response?.data?.extras?.result_codes) {
      return formatHorizonResultCodes(
        maybeError.response.data.extras.result_codes,
      );
    }

    if (maybeError.response?.data?.detail) {
      return maybeError.response.data.detail;
    }

    if (maybeError.response?.data?.title) {
      return maybeError.response.data.title;
    }

    if (maybeError.message) {
      return maybeError.message;
    }
  }

  return "Unexpected error. Please check the transaction details and try again.";
}

export async function fetchXlmBalance(publicKey: string): Promise<BalanceResult> {
  const server = new Horizon.Server(HORIZON_TESTNET_URL);

  try {
    const account = await server.loadAccount(publicKey);
    const nativeBalance = account.balances.find(
      (balance) => balance.asset_type === "native",
    );

    return {
      status: "funded",
      balance: nativeBalance?.balance ?? "0.0000000",
    };
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "response" in error &&
      (error as { response?: { status?: number } }).response?.status === 404
    ) {
      return { status: "unfunded", balance: null };
    }

    throw error;
  }
}

export async function buildPaymentTransaction({
  amount,
  recipient,
  sourcePublicKey,
}: {
  amount: string;
  recipient: string;
  sourcePublicKey: string;
}) {
  const server = new Horizon.Server(HORIZON_TESTNET_URL);
  const sourceAccount = await server.loadAccount(sourcePublicKey);

  return new TransactionBuilder(sourceAccount, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      Operation.payment({
        destination: recipient,
        asset: Asset.native(),
        amount,
      }),
    )
    .addMemo(Memo.text("Stellar Testnet Pay"))
    .setTimeout(180)
    .build();
}

export function inspectSignedTransaction(
  signedXdr: string,
): SignedTransactionInfo {
  const transaction = TransactionBuilder.fromXDR(signedXdr, Networks.TESTNET);

  if (!("source" in transaction)) {
    throw new Error("Fee bump transactions are not supported by this app.");
  }

  return {
    signatureCount: transaction.signatures.length,
    source: transaction.source,
  };
}

export async function submitSignedTransaction(signedXdr: string) {
  const response = await fetch(`${HORIZON_TESTNET_URL}/transactions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ tx: signedXdr }),
  });
  const data = await response.json();

  if (!response.ok) {
    throw { response: { data, status: response.status } };
  }

  return data;
}
