export default function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div className={`toast${toast.error ? ' toast--error' : ''}`} role="status">
      {toast.message}
    </div>
  );
}
