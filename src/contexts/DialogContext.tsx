import React, { createContext, useContext, useState, useRef, ReactNode } from 'react';
import { XIcon } from '../components/Icons';

type DialogType = 'alert' | 'confirm' | 'prompt';

interface DialogOptions {
  type: DialogType;
  title: string;
  message: string | ReactNode;
  confirmText?: string;
  cancelText?: string;
  inputType?: string;
  inputPlaceholder?: string;
  onConfirm: (value?: string) => void;
  onCancel: () => void;
}

interface DialogContextValue {
  alert: (message: string | ReactNode, title?: string) => Promise<void>;
  confirm: (message: string | ReactNode, title?: string, confirmText?: string) => Promise<boolean>;
  prompt: (title: string, message: string | ReactNode, options?: { type?: string; placeholder?: string; confirmText?: string }) => Promise<string | null>;
}

const DialogContext = createContext<DialogContextValue | undefined>(undefined);

export function useDialog() {
  const context = useContext(DialogContext);
  if (!context) {
    throw new Error('useDialog must be used within a DialogProvider');
  }
  return context;
}

export function DialogProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<DialogOptions | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const alert = (message: string | ReactNode, title: string = 'Alert') => {
    return new Promise<void>((resolve) => {
      setDialog({
        type: 'alert',
        title,
        message,
        confirmText: 'OK',
        onConfirm: () => {
          setDialog(null);
          resolve();
        },
        onCancel: () => {
          setDialog(null);
          resolve();
        }
      });
    });
  };

  const confirm = (message: string | ReactNode, title: string = 'Confirm', confirmText: string = 'Ok') => {
    return new Promise<boolean>((resolve) => {
      setDialog({
        type: 'confirm',
        title,
        message,
        confirmText,
        cancelText: 'Cancel',
        onConfirm: () => {
          setDialog(null);
          resolve(true);
        },
        onCancel: () => {
          setDialog(null);
          resolve(false);
        }
      });
    });
  };

  const prompt = (title: string, message: string | ReactNode, options?: { type?: string; placeholder?: string; confirmText?: string }) => {
    return new Promise<string | null>((resolve) => {
      setDialog({
        type: 'prompt',
        title,
        message,
        confirmText: options?.confirmText || 'OK',
        cancelText: 'Cancel',
        inputType: options?.type || 'text',
        inputPlaceholder: options?.placeholder || '',
        onConfirm: (value?: string) => {
          setDialog(null);
          resolve(value || null);
        },
        onCancel: () => {
          setDialog(null);
          resolve(null);
        }
      });
    });
  };

  const handlePromptSubmit = () => {
    const value = inputRef.current?.value || '';
    if (value.trim()) {
      dialog?.onConfirm(value);
    }
  };

  return (
    <DialogContext.Provider value={{ alert, confirm, prompt }}>
      {children}
      
      {dialog && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 10000
        }}>
          <div style={{
            background: 'var(--surface-color)', width: 420, borderRadius: 12,
            boxShadow: '0 12px 32px rgba(0,0,0,0.3)', overflow: 'hidden',
            border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column',
            animation: 'fadeIn 0.2s ease-out'
          }}>
            <div style={{
              padding: '16px 20px', borderBottom: '1px solid var(--border-color)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between'
            }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{dialog.title}</h3>
              <button onClick={dialog.onCancel} style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-secondary)', padding: 4
              }}>
                <XIcon size={18} />
              </button>
            </div>
            
            <div style={{ padding: '20px', fontSize: 13, color: 'var(--text-primary)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
              {dialog.message}
              {dialog.type === 'prompt' && (
                <input
                  ref={inputRef}
                  type={dialog.inputType || 'text'}
                  placeholder={dialog.inputPlaceholder}
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && handlePromptSubmit()}
                  style={{ width: '100%', marginTop: 12, padding: '10px 12px', fontSize: 13 }}
                />
              )}
            </div>

            <div style={{ 
              padding: '16px 20px', borderTop: '1px solid var(--border-color)', 
              display: 'flex', justifyContent: 'flex-end', gap: 10, background: 'rgba(0,0,0,0.02)'
            }}>
              {(dialog.type === 'confirm' || dialog.type === 'prompt') && (
                <button className="btn btn-sm btn-outline" onClick={dialog.onCancel}>
                  {dialog.cancelText}
                </button>
              )}
              <button 
                className={`btn btn-sm ${dialog.type === 'confirm' ? 'btn-danger' : 'btn-primary'}`} 
                onClick={dialog.type === 'prompt' ? handlePromptSubmit : () => dialog.onConfirm()}
                autoFocus={dialog.type !== 'prompt'}
                style={dialog.type === 'alert' ? { minWidth: 80 } : undefined}
              >
                {dialog.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
}
