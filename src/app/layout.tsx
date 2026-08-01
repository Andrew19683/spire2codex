import type {Metadata} from "next";
import "./globals.css";
export const metadata:Metadata={title:"Spire2Codex — Ladder Challenge",description:"Челленджи для Slay the Spire 2"};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="ru"><body>{children}</body></html>}
