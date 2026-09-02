/**
 * CSV Import Component for Bulk Threshold Updates
 * Features: Drag-drop file upload, CSV validation, preview modal, batch update
 */

import { Upload, X, AlertCircle, CheckCircle, Copy } from "lucide-react";
import { ChangeEvent, DragEvent, useRef, useState } from "react";
import { Modal } from "./ListPageShell";
import type { Material } from "../lib/types";
import {
  parseThresholdCSV,
  generateSampleThresholdCSV,
  type ThresholdUpdate,
} from "../lib/csv";

interface CSVImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  materials: Material[];
  onImport: (updates: ThresholdUpdate[]) => Promise<any>;
  isLoading?: boolean;
}

export function CSVImportModal({
  isOpen,
  onClose,
  materials,
  onImport,
  isLoading = false,
}: CSVImportModalProps) {
  const [step, setStep] = useState<"upload" | "preview" | "importing">(
    "upload",
  );
  const [csvContent, setCSVContent] = useState("");
  const [parseError, setParseError] = useState("");
  const [parsedUpdates, setParsedUpdates] = useState<ThresholdUpdate[]>([]);
  const [parseWarnings, setParseWarnings] = useState<
    Array<{ row: number; error: string }>
  >([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState("");
  const [isDragging, setIsDragging] = useState(false);

  const materialById = new Map(materials.map((m) => [m.id, m]));

  function readCSVFile(file: File) {
    if (!file) return;

    if (!file.name.endsWith(".csv")) {
      setParseError("Please select a CSV file");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      handleCSVContent(content);
    };
    reader.onerror = () => setParseError("Failed to read file");
    reader.readAsText(file);
  }

  function handleFileSelect(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) readCSVFile(file);
  }

  function handleDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) readCSVFile(file);
  }

  function handleCSVContent(content: string) {
    setCSVContent(content);
    setParseError("");
    setImportError("");

    const result = parseThresholdCSV(content);

    if (result.valid.length === 0) {
      setParseError(
        result.errors.length > 0
          ? `Parse error: ${result.errors[0].error} (row ${result.errors[0].row})`
          : "No valid data found in CSV",
      );
      return;
    }

    // The backend validates material IDs across the full dataset, not only this page.
    setParsedUpdates(result.valid);
    setParseWarnings(result.errors);
    setStep("preview");
  }

  async function handleImport() {
    setStep("importing");
    setImportError("");

    try {
      await onImport(parsedUpdates);
      // Success - close modal after a brief delay
      setTimeout(() => {
        onClose();
        setStep("upload");
        setCSVContent("");
        setParsedUpdates([]);
        setParseWarnings([]);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }, 500);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Import failed");
      setStep("preview");
    }
  }

  function downloadSample() {
    const csv = generateSampleThresholdCSV(materials);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "materials-thresholds-sample.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!isOpen) return null;

  return (
    <Modal title="Bulk Import Safety Thresholds" onClose={onClose}>
      <div className="modal-content" style={{ maxWidth: "800px" }}>
        {step === "upload" && (
          <div className="csv-import-container">
            <div className="upload-section">
              <label
                htmlFor="csv-file"
                className={`drag-drop-area${isDragging ? " is-dragging" : ""}`}
                onDragEnter={(event) => {
                  event.preventDefault();
                  setIsDragging(true);
                }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
              >
                <Upload size={32} style={{ color: "var(--primary)" }} />
                <p className="drag-drop-title">Drag and drop CSV file here</p>
                <p className="drag-drop-help">
                  or click to select from computer
                </p>
                <input
                  ref={fileInputRef}
                  id="csv-file"
                  type="file"
                  accept=".csv"
                  onChange={handleFileSelect}
                  style={{ display: "none" }}
                />
              </label>

              {parseError && (
                <div className="error-box">
                  <AlertCircle size={16} />
                  <span>{parseError}</span>
                </div>
              )}

              <div className="csv-help-section">
                <h4>CSV Format Requirements</h4>
                <p>Your CSV file must contain these columns:</p>
                <ul style={{ margin: "8px 0", paddingLeft: "20px" }}>
                  <li>
                    <code>material_id</code> (or <code>id</code>) - Required
                  </li>
                  <li>
                    <code>safety_threshold</code> (or <code>threshold</code>) -
                    Required
                  </li>
                  <li>
                    <code>name</code> - Optional, for reference only
                  </li>
                </ul>
                <p
                  style={{
                    fontSize: "0.9em",
                    color: "var(--text-secondary)",
                    margin: "8px 0",
                  }}
                >
                  Example: <code>material_id,name,safety_threshold</code>
                </p>
              </div>

              <button
                type="button"
                className="link-button"
                onClick={downloadSample}
                style={{ marginTop: "12px" }}
              >
                <Download size={14} />
                Download Sample CSV
              </button>
            </div>
          </div>
        )}

        {step === "preview" && (
          <div className="preview-section">
            <div className="preview-stats">
              <div className="stat-box success">
                <CheckCircle size={16} />
                <div>
                  <strong>{parsedUpdates.length}</strong>
                  <span>Updates Ready</span>
                </div>
              </div>
              {parseWarnings.length > 0 && (
                <div className="stat-box warning">
                  <AlertCircle size={16} />
                  <div>
                    <strong>{parseWarnings.length}</strong>
                    <span>Warnings</span>
                  </div>
                </div>
              )}
            </div>

            {parseWarnings.length > 0 && (
              <div className="warnings-box">
                <h4>Warnings</h4>
                <ul style={{ margin: "8px 0", paddingLeft: "20px" }}>
                  {parseWarnings.slice(0, 5).map((w, idx) => (
                    <li
                      key={idx}
                      style={{ fontSize: "0.9em", margin: "4px 0" }}
                    >
                      Row {w.row}: {w.error}
                    </li>
                  ))}
                  {parseWarnings.length > 5 && (
                    <li
                      style={{
                        fontSize: "0.9em",
                        margin: "4px 0",
                        fontStyle: "italic",
                      }}
                    >
                      +{parseWarnings.length - 5} more...
                    </li>
                  )}
                </ul>
              </div>
            )}

            <div className="preview-table-wrapper">
              <h4>Preview of Updates</h4>
              <table className="preview-table">
                <thead>
                  <tr>
                    <th>Material ID</th>
                    <th>Material Name</th>
                    <th>Current Threshold</th>
                    <th>New Threshold</th>
                    <th>Change</th>
                  </tr>
                </thead>
                <tbody>
                  {parsedUpdates.slice(0, 10).map((update) => {
                    const material = materialById.get(update.id);
                    const current = material?.safetyThreshold ?? 0;
                    const change = update.safetyThreshold - current;

                    return (
                      <tr key={update.id}>
                        <td
                          style={{
                            fontSize: "0.85em",
                            fontFamily: "monospace",
                          }}
                        >
                          {update.id}
                        </td>
                        <td>{material?.name ?? "Unknown"}</td>
                        <td>{current}</td>
                        <td style={{ fontWeight: "bold" }}>
                          {update.safetyThreshold}
                        </td>
                        <td
                          style={{
                            color:
                              change > 0
                                ? "var(--success)"
                                : change < 0
                                  ? "var(--warning)"
                                  : "var(--text-secondary)",
                          }}
                        >
                          {change > 0 ? "+" : ""}
                          {change}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {parsedUpdates.length > 10 && (
                <p
                  style={{
                    textAlign: "center",
                    color: "var(--text-secondary)",
                    fontSize: "0.9em",
                    margin: "8px 0",
                  }}
                >
                  ...and {parsedUpdates.length - 10} more
                </p>
              )}
            </div>

            {importError && (
              <div className="error-box">
                <AlertCircle size={16} />
                <span>{importError}</span>
              </div>
            )}
          </div>
        )}

        {step === "importing" && (
          <div style={{ textAlign: "center", padding: "40px 20px" }}>
            <div className="loading-spinner"></div>
            <p style={{ marginTop: "16px", color: "var(--text-secondary)" }}>
              Importing {parsedUpdates.length} threshold updates...
            </p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="modal-actions">
          {step === "upload" && (
            <>
              <button className="button secondary" onClick={onClose}>
                Close
              </button>
            </>
          )}

          {step === "preview" && (
            <>
              <button
                className="button secondary"
                onClick={() => {
                  setStep("upload");
                  setParsedUpdates([]);
                  setParseWarnings([]);
                }}
                disabled={isLoading}
              >
                Back
              </button>
              <button
                className="button primary"
                onClick={handleImport}
                disabled={isLoading}
              >
                {isLoading ? "Importing..." : "Import Changes"}
              </button>
            </>
          )}

          {step === "importing" && (
            <button className="button secondary" disabled={true}>
              Processing...
            </button>
          )}
        </div>
      </div>

      <style>{`
        .csv-import-container {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .upload-section {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .drag-drop-area {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
          padding: 40px 20px;
          border: 2px dashed var(--border);
          border-radius: 8px;
          background: var(--bg-card);
          cursor: pointer;
          transition: all 0.2s;
        }

        .drag-drop-area:hover {
          border-color: var(--primary);
          background: var(--bg);
        }

        .drag-drop-area.is-dragging {
          border-color: var(--primary);
          background: var(--primary-light);
        }

        .drag-drop-title {
          font-weight: 600;
          color: var(--text-main);
          margin: 0;
        }

        .drag-drop-help {
          font-size: 0.9em;
          color: var(--text-secondary);
          margin: 0;
        }

        .csv-help-section {
          padding: 12px 16px;
          background: var(--bg);
          border-left: 3px solid var(--primary);
          border-radius: 4px;
        }

        .csv-help-section h4 {
          margin: 0 0 8px 0;
          font-size: 0.95em;
          color: var(--text-main);
        }

        .csv-help-section p {
          margin: 8px 0;
          font-size: 0.9em;
          color: var(--text-secondary);
        }

        .csv-help-section ul {
          margin: 8px 0;
          padding-left: 20px;
        }

        .csv-help-section li {
          font-size: 0.9em;
          color: var(--text-secondary);
          margin: 4px 0;
        }

        .csv-help-section code {
          background: var(--bg-card);
          padding: 2px 6px;
          border-radius: 3px;
          font-family: monospace;
          font-size: 0.85em;
          color: var(--primary);
        }

        .error-box {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 16px;
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid var(--danger);
          border-radius: 6px;
          color: var(--danger);
          font-size: 0.95em;
        }

        .warnings-box {
          padding: 12px 16px;
          background: rgba(217, 119, 6, 0.1);
          border: 1px solid var(--warning);
          border-radius: 6px;
          color: var(--text-main);
        }

        .warnings-box h4 {
          margin: 0 0 8px 0;
          font-size: 0.95em;
          color: var(--warning);
        }

        .preview-section {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .preview-stats {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
        }

        .stat-box {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 16px;
          border-radius: 6px;
          font-size: 0.9em;
        }

        .stat-box.success {
          background: rgba(34, 197, 94, 0.1);
          color: var(--success);
          border: 1px solid rgba(34, 197, 94, 0.3);
        }

        .stat-box.warning {
          background: rgba(217, 119, 6, 0.1);
          color: var(--warning);
          border: 1px solid rgba(217, 119, 6, 0.3);
        }

        .stat-box strong {
          display: block;
          font-size: 1.2em;
          line-height: 1;
        }

        .stat-box span {
          display: block;
          font-size: 0.85em;
          opacity: 0.8;
        }

        .preview-table-wrapper {
          display: flex;
          flex-direction: column;
          gap: 8px;
          max-height: 400px;
          overflow-y: auto;
          padding: 0 4px;
        }

        .preview-table-wrapper h4 {
          margin: 0;
          font-size: 0.95em;
          color: var(--text-main);
        }

        .preview-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.9em;
          border: 1px solid var(--border);
          border-radius: 4px;
          overflow: hidden;
        }

        .preview-table thead {
          background: var(--bg);
          position: sticky;
          top: 0;
        }

        .preview-table th {
          padding: 8px 12px;
          text-align: left;
          font-weight: 600;
          color: var(--text-main);
          border-bottom: 2px solid var(--border);
        }

        .preview-table td {
          padding: 8px 12px;
          border-bottom: 1px solid var(--border-light);
        }

        .preview-table tbody tr:hover {
          background: var(--bg);
        }

        .loading-spinner {
          width: 40px;
          height: 40px;
          border: 3px solid var(--border);
          border-top-color: var(--primary);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
          margin: 0 auto;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .modal-actions {
          display: flex;
          gap: 12px;
          justify-content: flex-end;
          margin-top: 24px;
          padding-top: 16px;
          border-top: 1px solid var(--border);
        }

        .link-button {
          background: none;
          border: none;
          color: var(--primary);
          cursor: pointer;
          padding: 0;
          font-size: 0.95em;
          display: flex;
          align-items: center;
          gap: 8px;
          text-decoration: none;
          transition: opacity 0.2s;
        }

        .link-button:hover {
          opacity: 0.7;
        }
      `}</style>
    </Modal>
  );
}

function Download({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}
