import "./globals.css";

export const metadata = {
  title: "Quiniela Mundial 2026",
  description: "Quiniela familiar para el Mundial de Futbol 2026"
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
