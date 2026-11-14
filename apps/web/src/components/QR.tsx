// QR 코드(SVG). 랭킹·팀 페이지에서 '폰으로 참여'에 쓴다.
import QRCode from "qrcode";
import { useEffect, useState } from "react";

export function QR({ url, size = 180 }: { url: string; size?: number }) {
  const [svg, setSvg] = useState("");
  useEffect(() => {
    QRCode.toString(url, { type: "svg", margin: 1, color: { dark: "#1d1640", light: "#ffffff" } })
      .then(setSvg)
      .catch(() => setSvg(""));
  }, [url]);
  return <div className="qr" style={{ width: size, height: size }} aria-label={`QR 코드: ${url}`} dangerouslySetInnerHTML={{ __html: svg }} />;
}

/** 참여 주소: 랭킹 페이지에서 바꾼 주소(같은 와이파이·배포 주소)가 있으면 그것 */
export const joinUrl = () => {
  try {
    const v = JSON.parse(window.localStorage.getItem("fs:join:v1") ?? "null");
    return typeof v === "string" && v ? v : window.location.origin;
  } catch {
    return window.location.origin;
  }
};
