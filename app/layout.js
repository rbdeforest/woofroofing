export const metadata = {
  title: "New App",
  description: "Placeholder app",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
