'use client'

import { type ReactNode, useEffect, useRef } from 'react'
import { X } from 'lucide-react'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  maxWidth?: string
}

export function Modal({ open, onClose, title, children, maxWidth = '28rem' }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const el = dialogRef.current
    if (!el) return
    if (open && !el.open) el.showModal()
    if (!open && el.open) el.close()
  }, [open])

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="backdrop:bg-black/40 bg-transparent p-0 m-auto"
      style={{ maxWidth }}
    >
      <div className="bg-white border border-[var(--border)] rounded-xl shadow-lg p-5 text-[var(--text)]">
        {title && (
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-[var(--text)]">{title}</h2>
            <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer p-1 rounded-lg hover:bg-slate-100 transition-colors">
              <X className="size-4" />
            </button>
          </div>
        )}
        {children}
      </div>
    </dialog>
  )
}
