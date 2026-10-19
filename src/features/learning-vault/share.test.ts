// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { browserShareIo, copyShare, copyWithSelection, nativeShare, type ShareIo } from "./share";

const origin = "https://journey.example";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("copyShare", () => {
  it("says copied when the clipboard takes the words", async () => {
    const copy = vi.fn(() => Promise.resolve());
    await expect(copyShare("Leg Press — Open in Journey", { copy, origin })).resolves.toBe("copied");
    expect(copy).toHaveBeenCalledWith("Leg Press — Open in Journey");
  });

  it("says failed when the clipboard refuses, or there is none", async () => {
    await expect(copyShare("x", { copy: () => Promise.reject(new Error("denied")), origin })).resolves.toBe("failed");
    await expect(copyShare("x", { origin })).resolves.toBe("failed");
  });

  it("starts the write inside the tap, before anything is awaited", () => {
    let started = false;
    const io: ShareIo = {
      copy: () => {
        started = true;
        return Promise.resolve();
      },
      origin,
    };
    void copyShare("x", io);
    // Safari allows a clipboard write only while it is handling the tap.
    expect(started).toBe(true);
  });
});

describe("nativeShare", () => {
  const data = { title: "Leg Press", text: "Leg Press — Open in Journey https://journey.example/l/machine~m-leg-press" };

  it("says shared when the share sheet finishes", async () => {
    const share = vi.fn(() => Promise.resolve());
    await expect(nativeShare(data, { share, origin })).resolves.toBe("shared");
    expect(share).toHaveBeenCalledWith(data);
  });

  it("says cancelled when the person closes the sheet, and failed for any other refusal", async () => {
    const abort = Object.assign(new Error("closed"), { name: "AbortError" });
    await expect(nativeShare(data, { share: () => Promise.reject(abort), origin })).resolves.toBe("cancelled");
    const denied = Object.assign(new Error("no tap"), { name: "NotAllowedError" });
    await expect(nativeShare(data, { share: () => Promise.reject(denied), origin })).resolves.toBe("failed");
  });

  it("says unavailable where there is no share sheet", async () => {
    await expect(nativeShare(data, { origin })).resolves.toBe("unavailable");
  });

  it("opens the sheet inside the tap, before anything is awaited", () => {
    let opened = false;
    void nativeShare(data, {
      share: () => {
        opened = true;
        return Promise.resolve();
      },
      origin,
    });
    expect(opened).toBe(true);
  });
});

describe("copyWithSelection (the old way, for a page that is not secure)", () => {
  it("selects the words in a hidden field, copies them and takes the field away", () => {
    const exec = vi.fn(() => true);
    Object.defineProperty(document, "execCommand", { value: exec, configurable: true, writable: true });
    const before = document.createElement("button");
    document.body.appendChild(before);
    before.focus();
    let selected = "";
    exec.mockImplementation(() => {
      const field = document.querySelector("textarea");
      selected = field ? field.value.slice(field.selectionStart ?? 0, field.selectionEnd ?? 0) : "";
      return true;
    });
    expect(copyWithSelection("The words", document)).toBe(true);
    expect(exec).toHaveBeenCalledWith("copy");
    expect(selected).toBe("The words");
    expect(document.querySelector("textarea")).toBeNull();
    expect(document.activeElement).toBe(before);
    before.remove();
  });

  it("answers false, and never throws, when the browser will not copy", () => {
    Object.defineProperty(document, "execCommand", {
      value: () => {
        throw new Error("not here");
      },
      configurable: true,
      writable: true,
    });
    expect(copyWithSelection("x", document)).toBe(false);
    expect(document.querySelector("textarea")).toBeNull();
    expect(copyWithSelection("x", null)).toBe(false);
  });
});

describe("browserShareIo", () => {
  it("knows the origin, and offers the share sheet only where the browser has one", () => {
    vi.stubGlobal("navigator", { ...navigator, share: undefined, clipboard: undefined });
    const io = browserShareIo();
    expect(io.origin).toBe(window.location.origin);
    expect(io.share).toBeUndefined();
    expect(typeof io.copy).toBe("function");
  });

  it("hands the share sheet the data it was given", async () => {
    const share = vi.fn(() => Promise.resolve());
    vi.stubGlobal("navigator", { ...navigator, share });
    const io = browserShareIo();
    await io.share!({ title: "t", text: "w" });
    expect(share).toHaveBeenCalledWith({ title: "t", text: "w" });
  });

  it("uses the clipboard on a secure page, and the old way when the clipboard refuses", async () => {
    const writeText = vi.fn(() => Promise.reject(new Error("denied")));
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
    const exec = vi.fn(() => true);
    Object.defineProperty(document, "execCommand", { value: exec, configurable: true, writable: true });
    await expect(browserShareIo().copy!("words")).resolves.toBeUndefined();
    expect(writeText).toHaveBeenCalledWith("words");
    expect(exec).toHaveBeenCalledWith("copy");
  });

  it("copies the old way on a page that is not secure (an iPad on the PC's Wi-Fi address)", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    Object.defineProperty(window, "isSecureContext", { value: false, configurable: true });
    const exec = vi.fn(() => true);
    Object.defineProperty(document, "execCommand", { value: exec, configurable: true, writable: true });
    await expect(browserShareIo().copy!("words")).resolves.toBeUndefined();
    expect(writeText).not.toHaveBeenCalled();
    expect(exec).toHaveBeenCalledWith("copy");
  });

  it("says it could not copy when neither way works", async () => {
    vi.stubGlobal("navigator", { ...navigator, clipboard: undefined });
    Object.defineProperty(document, "execCommand", { value: () => false, configurable: true, writable: true });
    await expect(copyShare("words", browserShareIo())).resolves.toBe("failed");
  });
});
