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
