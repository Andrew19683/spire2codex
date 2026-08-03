import Image from "next/image";
import { branding } from "@/config/branding";

export default function Brand() {
  return (
    <>
      <Image
        className="brandmark"
        src={branding.logoSrc}
        alt={branding.logoAlt}
        width={44}
        height={44}
        unoptimized
      />
      <span>SPIRE2CODEX</span>
    </>
  );
}
