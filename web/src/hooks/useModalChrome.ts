import { useEffect, useRef } from "react";

interface ModalChromeOptions {
  isOpen: boolean;
  onClose: () => void;
  lockScroll?: boolean;
  closeOnEscape?: boolean;
  closeOnBackdrop?: boolean;
}

/**
 * Reusable modal ergonomics hook:
 * - Prevents background page scrolling while modal is open.
 * - Handles Escape key to dismiss.
 * - Manages backdrop clicks with arming delay to prevent accidental click-through dismissal.
 */
export function useModalChrome({
  isOpen,
  onClose,
  lockScroll = true,
  closeOnEscape = true,
  closeOnBackdrop = true,
}: ModalChromeOptions) {
  const armedRef = useRef(false);

  // Arming delay: wait 120ms before accepting backdrop dismissals
  useEffect(() => {
    if (!isOpen) {
      armedRef.current = false;
      return;
    }
    const timer = setTimeout(() => {
      armedRef.current = true;
    }, 120);
    return () => clearTimeout(timer);
  }, [isOpen]);

  // Scroll lock
  useEffect(() => {
    if (!isOpen || !lockScroll) return;
    const originalOverflow = document.body.style.overflow;
    const originalPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.paddingRight = originalPaddingRight;
    };
  }, [isOpen, lockScroll]);

  // Escape key handler
  useEffect(() => {
    if (!isOpen || !closeOnEscape) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, closeOnEscape, onClose]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (!closeOnBackdrop) return;
    if (!armedRef.current) return;
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return {
    handleBackdropClick,
  };
}
