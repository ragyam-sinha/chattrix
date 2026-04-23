export default function Avatar({ src, name, size = 'md' }) {
  const sizeClass = size === 'lg' ? 'avatar-lg' : size === 'sm' ? 'avatar-sm' : '';
  const initial = (name || '?').charAt(0).toUpperCase();

  if (src) {
    return (
      <img
        className={`avatar ${sizeClass}`}
        src={src}
        alt={name || 'avatar'}
        referrerPolicy="no-referrer"
        onError={(e) => {
          e.target.style.display = 'none';
          e.target.nextSibling.style.display = 'flex';
        }}
      />
    );
  }

  return (
    <div className={`avatar avatar-placeholder ${sizeClass}`}>
      {initial}
    </div>
  );
}
