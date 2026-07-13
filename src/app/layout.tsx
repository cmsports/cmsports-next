import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { PerfilProvider } from "@/lib/auth/PerfilProvider";
import { ModulosProvider } from "@/lib/hooks/useModulos";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import AvisoPagoPlanGlobal from "@/components/aviso-pago-plan";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CmSports",
  description: "Plataforma de gestión deportiva",
  manifest: "/manifest.json",
  icons: {
    icon: "/logo.png",
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "CmSports",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#4f46e5",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ServiceWorkerRegister />
        <PerfilProvider>
          <ModulosProvider>
            <AvisoPagoPlanGlobal />
            {children}
          </ModulosProvider>
        </PerfilProvider>
      </body>
    </html>
  );
}
