import { useEffect, useRef, useState, type ReactElement, type KeyboardEvent } from 'react';

export interface SelectOption<T = string | number> {
  value: T;
  label: string;
}

export interface SelectFieldProps<T = string | number> {
  label: string;
  value: T;
  options: Array<SelectOption<T>>;
  onChange: (value: T) => void;
  className?: string;
}

export function SelectField<T = string | number>({
  label,
  value,
  options,
  onChange,
  className = '',
}: SelectFieldProps<T>): ReactElement {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value) ?? options[0];
  const displayLabel = selectedOption ? selectedOption.label : String(value);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(e: MouseEvent): void {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Scroll active item into view when opening
  useEffect(() => {
    if (isOpen && listRef.current) {
      const activeEl = listRef.current.querySelector('[aria-selected="true"]');
      if (activeEl && typeof activeEl.scrollIntoView === 'function') {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [isOpen]);

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>): void {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setIsOpen((prev) => !prev);
    } else if (e.key === 'Escape') {
      if (isOpen) {
        e.preventDefault();
        setIsOpen(false);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
      } else {
        const currentIndex = options.findIndex((opt) => opt.value === value);
        if (currentIndex < options.length - 1) {
          const nextOpt = options[currentIndex + 1];
          if (nextOpt) onChange(nextOpt.value);
        }
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
      } else {
        const currentIndex = options.findIndex((opt) => opt.value === value);
        if (currentIndex > 0) {
          const prevOpt = options[currentIndex - 1];
          if (prevOpt) onChange(prevOpt.value);
        }
      }
    }
  }

  return (
    <div
      ref={containerRef}
      className={`hr-select-container ${className}${isOpen ? ' hr-select-is-open' : ''}`}
    >
      {label ? <label className="hr-select-label">{label}</label> : null}
      <div
        className="hr-select-trigger"
        role="combobox"
        tabIndex={0}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={label}
        onClick={() => setIsOpen((prev) => !prev)}
        onKeyDown={handleKeyDown}
      >
        <span className="hr-select-value">{displayLabel}</span>
        <span className="hr-select-arrow" aria-hidden="true">
          <svg width="10" height="6" viewBox="0 0 10 6" fill="currentColor">
            <path d="M0 0l5 5 5-5z" />
          </svg>
        </span>
      </div>

      {isOpen ? (
        <div ref={listRef} className="hr-select-menu" role="listbox" aria-label={label}>
          {options.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <div
                key={String(opt.value)}
                role="option"
                aria-selected={isSelected}
                className={`hr-select-option${isSelected ? ' hr-select-option-active' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(opt.value);
                  setIsOpen(false);
                }}
              >
                {opt.label}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
