import crypto from "crypto";
import QRCode from "qrcode";

export function generateQrId() {
  const random = crypto
    .randomBytes(12)
    .toString("hex")
    .toUpperCase();

  return `ZK-${random}`;
}

export async function generateQrImage(qrId) {
  return await QRCode.toDataURL(qrId, {
    errorCorrectionLevel: "H",
    margin: 2,
    width: 500,
  });
}