import { describe, expect, it } from "vitest";
import {
  classifyAnonymousRefusal,
  maskR2Detail,
  parseS3XmlError,
} from "../src/business/r2-errors.js";

describe("parseS3XmlError", () => {
  it("extracts Code and Message", () => {
    const body =
      '<?xml version="1.0" encoding="UTF-8"?><Error><Code>InvalidArgument</Code>' +
      "<Message>Anonymous requests are not allowed</Message>" +
      "<Resource>/bucket/key</Resource></Error>";
    expect(parseS3XmlError(body)).toEqual({
      code: "InvalidArgument",
      message: "Anonymous requests are not allowed",
    });
  });

  it("tolerates a non-XML body", () => {
    expect(parseS3XmlError("")).toEqual({ code: null, message: null });
    expect(parseS3XmlError("<html>gateway</html>")).toEqual({
      code: null,
      message: null,
    });
  });
});

describe("maskR2Detail", () => {
  it("masks endpoints, Credential= fragments and raw key shapes", () => {
    expect(
      maskR2Detail(
        "GET https://abc123xyz.r2.cloudflarestorage.com/b/k failed Credential=AKIDEXAMPLE/20261024/auto/s3/aws4_request key=0123456789ABCDEF0123456789ABCDEF"
      )
    ).toBe(
      "GET https://<account>.r2.cloudflarestorage.com/b/k failed Credential=<masked>/20261024/auto/s3/aws4_request key=<masked-key>"
    );
  });
});

describe("classifyAnonymousRefusal (staging policy)", () => {
  const errorOf = (code: string | null, message: string | null = null) => ({
    code,
    message,
  });

  it("2xx or leaked bytes is always a LEAK failure", () => {
    expect(
      classifyAnonymousRefusal({
        status: 200,
        error: errorOf(null),
        bytesLeaked: true,
      })
    ).toMatchObject({ pass: false, verdict: "leak" });
    expect(
      classifyAnonymousRefusal({
        status: 400,
        error: errorOf("InvalidArgument"),
        bytesLeaked: true,
      })
    ).toMatchObject({ pass: false, verdict: "leak" });
  });

  it("401/403 passes as auth-required", () => {
    for (const status of [401, 403]) {
      expect(
        classifyAnonymousRefusal({
          status,
          error: errorOf(status === 401 ? "Unauthorized" : "AccessDenied"),
          bytesLeaked: false,
        })
      ).toMatchObject({ pass: true, verdict: "auth-required" });
    }
  });

  it("400 + InvalidArgument + no bytes = protocol rejection WITH the not-an-ACL-proof caveat", () => {
    const result = classifyAnonymousRefusal({
      status: 400,
      error: errorOf("InvalidArgument", "Anonymous requests are not allowed"),
      bytesLeaked: false,
    });
    expect(result.pass).toBe(true);
    expect(result.verdict).toBe("protocol-rejection-unsigned");
    expect(result.reason).toContain("not by itself proof of the bucket ACL");
    expect(result.reason).toContain("Anonymous requests are not allowed");
  });

  it("400 with any OTHER code fails as construction-suspect (no blanket 400 pass)", () => {
    for (const code of ["InvalidURI", "InvalidBucketName", "MalformedXML", null]) {
      expect(
        classifyAnonymousRefusal({
          status: 400,
          error: errorOf(code),
          bytesLeaked: false,
        })
      ).toMatchObject({ pass: false, verdict: "construction-suspect" });
    }
  });

  it("404 after a successful signed control is ambiguous and fails", () => {
    expect(
      classifyAnonymousRefusal({
        status: 404,
        error: errorOf("NoSuchKey"),
        bytesLeaked: false,
      })
    ).toMatchObject({ pass: false, verdict: "auth-unclear" });
  });

  it("any other status fails as other-refusal", () => {
    expect(
      classifyAnonymousRefusal({
        status: 418,
        error: errorOf("Teapot"),
        bytesLeaked: false,
      })
    ).toMatchObject({ pass: false, verdict: "other-refusal" });
  });
});
