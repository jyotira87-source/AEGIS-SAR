import "./globals.css";

export const metadata = {
  title: "AEGIS-SAR // NTRO Maritime Intelligence",
  description:
    "Automated SAR oil slick segmentation & AIS vessel attribution — Project AEGIS-SAR (SIH26143).",
  keywords: [
    "SAR",
    "oil spill",
    "Sentinel-1",
    "AIS",
    "maritime surveillance",
    "NTRO",
    "AEGIS-SAR",
  ],
  authors: [{ name: "Project AEGIS-SAR // NTRO" }],
  openGraph: {
    title: "AEGIS-SAR // NTRO Maritime Intelligence",
    description:
      "Dual-layered automated SAR oil spill detection & AIS vessel correlation platform.",
    type: "website",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0B0F19",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="scroll-smooth">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}