interface Props {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: Props) {
  return <>{children}</>;
}
