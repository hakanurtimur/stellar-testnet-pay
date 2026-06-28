import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildExplorerUrl,
  formatErrorMessage,
  HORIZON_TESTNET_URL,
  shortenAddress,
  submitSignedTransaction,
  validateStellarPublicKey,
} from "../lib/stellar";

const validPublicKey =
  "GAI7S3HC3FW4EI4CMG5J7TECQGYP4QMAW5OUEVD4VA7WHOA5P5HEM36O";

describe("stellar helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shortens long Stellar addresses", () => {
    expect(shortenAddress(validPublicKey)).toBe("GAI7S3...EM36O");
  });

  it("leaves short values unchanged when shortening addresses", () => {
    expect(shortenAddress("GSHORT")).toBe("GSHORT");
  });

  it("validates Stellar public keys", () => {
    expect(validateStellarPublicKey(validPublicKey)).toBe(true);
    expect(validateStellarPublicKey("")).toBe(false);
    expect(validateStellarPublicKey("not-a-stellar-key")).toBe(false);
    expect(validateStellarPublicKey(validPublicKey.replace("G", "S"))).toBe(
      false,
    );
  });

  it("builds Stellar Expert testnet transaction URLs", () => {
    expect(buildExplorerUrl("abc123")).toBe(
      "https://stellar.expert/explorer/testnet/tx/abc123",
    );
  });

  it("formats common thrown errors into readable messages", () => {
    expect(formatErrorMessage(new Error("Freighter rejected the request"))).toBe(
      "Freighter rejected the request",
    );
    expect(formatErrorMessage("plain failure")).toBe("plain failure");
    expect(formatErrorMessage({ response: { data: { title: "Bad request" } } })).toBe(
      "Bad request",
    );
  });

  it("formats inactive recipient transaction failures clearly", () => {
    expect(
      formatErrorMessage({
        response: {
          data: {
            extras: {
              result_codes: {
                transaction: "tx_failed",
                operations: ["op_no_destination"],
              },
            },
          },
        },
      }),
    ).toBe(
      "Recipient account is not active on Stellar Testnet. Fund the recipient account first, then try again.",
    );
  });

  it("submits signed transactions as Horizon form data", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ hash: "tx-hash" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await submitSignedTransaction("signed-xdr");

    expect(response.hash).toBe("tx-hash");
    expect(fetchMock).toHaveBeenCalledWith(`${HORIZON_TESTNET_URL}/transactions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ tx: "signed-xdr" }),
    });
  });
});
