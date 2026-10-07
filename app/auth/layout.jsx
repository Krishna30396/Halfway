import ThemeToggle from '@/components/ThemeToggle';

export default function AuthLayout({ children }) {
  return (
    <>
      <div style={{ position: 'fixed', top: 16, right: 16, zIndex: 10 }}>
        <ThemeToggle />
      </div>
      {children}
    </>
  );
}
