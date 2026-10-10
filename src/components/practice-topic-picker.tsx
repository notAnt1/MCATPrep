"use client";
import { useState } from "react";
import {
  groups,
  sections,
  searchTopics,
  targetLabel,
  availableItems,
  type Annotation,
} from "@/lib/canonical-topics";
export function PracticeTopicPicker({
  value,
  onChange,
  section,
  onSectionChange,
  bank,
  ready,
}: {
  value: string;
  onChange: (v: string) => void;
  section: string;
  onSectionChange: (v: string) => void;
  bank: Annotation[];
  ready: boolean;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const matches = searchTopics(query, section);
  function choice(id: string, label: string) {
    const all = availableItems(bank, id, section, true).length,
      primary = availableItems(bank, id, section, false).length;
    return (
      <button
        type="button"
        className="canonical-choice"
        disabled={!ready || !all}
        aria-pressed={value === id}
        onClick={() => {
          onChange(id);
          setOpen(false);
          setQuery("");
        }}
      >
        <span>{label}</span>
        <span>
          {all} questions
          {all > primary ? " · " + (all - primary) + " integrated" : ""}
        </span>
      </button>
    );
  }
  return (
    <div className="canonical-picker">
      <div className="map-controls">
        <label>
          Section
          <select
            value={section}
            onChange={(e) => {
              onSectionChange(e.target.value);
              onChange("");
            }}
          >
            <option value="">All sections</option>
            {sections.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>
          Find a practice topic
          <input
            type="search"
            value={query}
            placeholder="Try membrane transport, NMR, or hormones"
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
          />
        </label>
      </div>
      <div className="canonical-selection">
        <strong>{value ? targetLabel(value) : "A balanced mix"}</strong>
        <button
          type="button"
          className="text-button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
        >
          {open ? "Close topics" : "Browse topics"}
        </button>
        {value && (
          <button
            type="button"
            className="text-button"
            onClick={() => onChange("")}
          >
            Clear selection
          </button>
        )}
      </div>
      {!ready && (
        <p role="status">
          Question availability is loading. Topic practice will be available
          when the catalog is connected.
        </p>
      )}
      {open && (
        <div className="canonical-tree">
          {groups.map((g) => {
            const ts = matches.filter((t) => t.group_id === g.id);
            if (!ts.length) return null;
            return (
              <details key={g.id} open={query.trim() ? true : undefined}>
                <summary>
                  {g.label} <span>{ts.length} topics</span>
                </summary>
                {ts.map((t) => (
                  <div className="canonical-topic" key={t.id}>
                    {choice(t.id, t.label)}
                    <details>
                      <summary>Subtopics</summary>
                      {t.selectable_subtopics.map((s) => (
                        <div key={s.id}>{choice(s.id, s.label)}</div>
                      ))}
                    </details>
                  </div>
                ))}
              </details>
            );
          })}
          {!matches.length && <p>No matching topics. Try another term.</p>}
        </div>
      )}
      <p className="topic-picker-help">
        Counts include primary targets and essential secondary targets
        (integrated practice). Zero means no reviewed questions are available
        yet.
      </p>
    </div>
  );
}
