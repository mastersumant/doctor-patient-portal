import { useEffect, useId, useRef, useState, type ReactNode, type Ref } from 'react'
import { classNames } from '@/utils/format'
import { controlClass } from './Field'

interface AutocompleteProps<T> {
  id?: string
  value: string
  onChange: (text: string) => void
  onPick: (item: T) => void
  fetchItems: (term: string) => Promise<T[]>
  itemKey: (item: T) => string
  renderItem: (item: T) => ReactNode
  placeholder?: string
  invalid?: boolean
  disabled?: boolean
  describedBy?: string
  emptyText?: string
  inputRef?: Ref<HTMLInputElement>
  onBlur?: () => void
}

/** Accessible combobox (ARIA 1.2 pattern) with async suggestions and free text. */
export function Autocomplete<T>({
  id,
  value,
  onChange,
  onPick,
  fetchItems,
  itemKey,
  renderItem,
  placeholder,
  invalid,
  disabled,
  describedBy,
  emptyText = 'No matches',
  inputRef,
  onBlur,
}: AutocompleteProps<T>) {
  const listId = useId()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<T[]>([])
  const [active, setActive] = useState(-1)
  const [term, setTerm] = useState(value)
  const fetchRef = useRef(fetchItems)
  fetchRef.current = fetchItems
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    const t = setTimeout(async () => {
      const result = await fetchRef.current(term)
      if (!cancelled) {
        setItems(result)
        setActive(result.length ? 0 : -1)
      }
    }, 120)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [term, open])

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const pick = (item: T) => {
    onPick(item)
    setOpen(false)
  }

  return (
    <div ref={wrapRef} className="relative">
      <input
        ref={inputRef}
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        autoComplete="off"
        disabled={disabled}
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setTerm(e.target.value)
          setOpen(true)
        }}
        onFocus={() => {
          setTerm(value)
          setOpen(true)
        }}
        onBlur={onBlur}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setOpen(true)
            setActive((a) => Math.min(items.length - 1, a + 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActive((a) => Math.max(0, a - 1))
          } else if (e.key === 'Enter' && open && active >= 0 && items[active]) {
            e.preventDefault()
            pick(items[active])
          } else if (e.key === 'Escape') {
            setOpen(false)
          }
        }}
        className={classNames(controlClass, 'h-10')}
      />
      {open ? (
        <ul id={listId} role="listbox" className="absolute z-30 mt-1 max-h-72 w-full min-w-64 overflow-y-auto rounded-[var(--radius-control)] border border-line bg-surface py-1 shadow-pop">
          {items.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted">{emptyText}</li>
          ) : (
            items.map((item, i) => (
              <li
                key={itemKey(item)}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => {
                  e.preventDefault()
                  pick(item)
                }}
                onMouseEnter={() => setActive(i)}
                className={classNames('cursor-pointer px-3 py-2 text-sm', i === active ? 'bg-brand-50' : '')}
              >
                {renderItem(item)}
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  )
}
