import './globals.css';

export const metadata = {
  title: 'DirtFit Commerce — Xe Máy Địa Hình & Rider Fit Simulator',
  description: 'Nền tảng thương mại điện tử chuyên xe máy địa hình và mô phỏng vóc dáng người lái.',
};

/**
 * Root layout for DirtFit storefront.
 * @param {object} props
 * @param {import('react').ReactNode} props.children
 * @returns {import('react').JSX.Element}
 */
export default function RootLayout({ children }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
