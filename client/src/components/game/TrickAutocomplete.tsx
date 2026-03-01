/**
 * TrickAutocomplete Component
 *
 * Autocomplete input powered by the curated skate trick dictionary.
 * Keeps the "call your trick" culture alive.
 */

import { useState, useRef, useCallback, useEffect, useId } from "react";
import { Input } from "@/components/ui/input";
import { searchTricks } from "@/lib/trickDictionary";
import { cn } from "@/lib/utils";

interface TrickAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
}

export function TrickAutocomplete({
  value,
  onChange,
  placeholder = "Kickflip, Heelflip, Tre Flip...",
  disabled,
  id,
  className,
}: TrickAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  const updateSuggestions = useCallback((query: string) => {
    if (query.trim().length === 0) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    const results = searchTricks(query);
    setSuggestions(results);
    setShowSuggestions(results.length > 0);
    setSelectedIndex(-1);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    onChange(val);
    updateSuggestions(val);
  };

  const handleSelect = (trick: string) => {
    onChange(trick);
    setShowSuggestions(false);
    setSuggestions([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions || suggestions.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, -1));
    } else if (e.key === "Enter" && selectedIndex >= 0) {
      e.preventDefault();
      handleSelect(suggestions[selectedIndex]);
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
    }
  };

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={wrapperRef} className={cn("relative", className)}>
      <Input
        id={id}
        placeholder={placeholder}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={() => value.trim() && updateSuggestions(value)}
        className="bg-neutral-900 border-neutral-700"
        maxLength={500}
        disabled={disabled}
        autoComplete="off"
        role="combobox"
        aria-expanded={showSuggestions && suggestions.length > 0}
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-activedescendant={
          selectedIndex >= 0 ? `${listboxId}-option-${selectedIndex}` : undefined
        }
      />
      {showSuggestions && suggestions.length > 0 && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-50 w-full mt-1 bg-neutral-900 border border-neutral-700 rounded-lg shadow-xl max-h-48 overflow-y-auto"
        >
          {suggestions.map((trick, index) => (
            <li
              key={trick}
              id={`${listboxId}-option-${index}`}
              role="option"
              aria-selected={index === selectedIndex}
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelect(trick);
              }}
              className={cn(
                "w-full text-left px-3 py-2 text-sm transition-colors cursor-pointer",
                index === selectedIndex
                  ? "bg-yellow-400/10 text-yellow-400"
                  : "text-neutral-300 hover:bg-neutral-800"
              )}
            >
              {trick}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
