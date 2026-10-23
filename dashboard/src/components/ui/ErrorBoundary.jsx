import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import Button from './Button.jsx';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.handleReset);
      }

      return (
        <div className="err-boundary" role="alert" style={{
          padding: '28px',
          margin: '20px auto',
          maxWidth: '560px',
          borderRadius: 'var(--radius, 12px)',
          border: '1px solid var(--border-strong, #e2e8f0)',
          background: 'var(--panel, #ffffff)',
          boxShadow: 'var(--shadow-sm, 0 1px 3px rgba(0,0,0,0.06))',
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '14px',
        }}>
          <div style={{
            display: 'grid',
            placeItems: 'center',
            width: '42px',
            height: '42px',
            borderRadius: '10px',
            background: 'var(--danger-soft, #fef2f2)',
            color: 'var(--danger-text, #b91c1c)',
          }}>
            <AlertTriangle size={20} aria-hidden="true" />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <h2 style={{
              margin: 0,
              fontSize: '16px',
              fontWeight: 650,
              color: 'var(--text, #0f172a)',
            }}>
              {this.props.title || 'Đã xảy ra lỗi khi hiển thị giao diện'}
            </h2>
            <p style={{
              margin: 0,
              fontSize: '13px',
              color: 'var(--text-muted, #64748b)',
              lineHeight: 1.5,
            }}>
              {this.state.error?.message || 'Có lỗi không mong muốn đã xảy ra. Hãy bấm thử lại.'}
            </p>
          </div>

          <Button
            size="sm"
            variant="primary"
            icon={RotateCcw}
            onClick={this.handleReset}>
            Thử lại
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
