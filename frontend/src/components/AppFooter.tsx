export default function AppFooter() {
  return (
    <footer style={{
      height: 40,
      backgroundColor: '#F5F5F5',
      borderTop: '1px solid #E0E0E0',
      display: 'flex',
      alignItems: 'center',
      padding: '0 24px',
      position: 'relative',
      flexShrink: 0,
    }}>
      {/* Truly centered copyright */}
      <span style={{
        position: 'absolute',
        left: '50%',
        transform: 'translateX(-50%)',
        fontSize: 12,
        color: '#757575',
        whiteSpace: 'nowrap',
      }}>
        © 2025 СпортПлан · v1.0.0
      </span>

      {/* Right: about link */}
      <a
        href="#about"
        style={{
          marginLeft: 'auto',
          fontSize: 12,
          color: '#757575',
          textDecoration: 'none',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = '#495057' }}
        onMouseLeave={(e) => { e.currentTarget.style.color = '#757575' }}
      >
        О системе
      </a>
    </footer>
  )
}
