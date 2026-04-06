import React, { createContext, useContext, useState, ReactNode } from 'react';
import { XIcon } from '../components/Icons';

type DialogType = 'alert' | 'confirm';

interface DialogOptions {
  type: DialogType;
  title: string;
  message: string | ReactNode;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

interface DialogContextValue {
  alert: (message: string | ReactNode, title?: string) => Promise<void>;
  confirm: (message: string | ReactNode, title?: string, confirmText?: string) => Promise<boolean>;
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

  return (
    <DialogContext.Provider value={{ alert, confirm }}>
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
            </div>

            <div style={{ 
              padding: '16px 20px', borderTop: '1px solid var(--border-color)', 
              display: 'flex', justifyContent: 'flex-end', gap: 10, background: 'rgba(0,0,0,0.02)'
            }}>
              {dialog.type === 'confirm' && (
                <button className="btn btn-sm btn-outline" onClick={dialog.onCancel}>
                  {dialog.cancelText}
                </button>
              )}
              <button 
                className={`btn btn-sm ${dialog.type === 'confirm' ? 'btn-danger' : 'btn-primary'}`} 
                onClick={dialog.onConfirm}
                autoFocus
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
