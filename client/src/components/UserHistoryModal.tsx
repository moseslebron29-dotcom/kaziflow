import { X, ShieldCheck } from "lucide-react";
import { formatKes } from "../lib/format";

const date = (v: unknown) => {
  const value = new Date(String(v));
  return Number.isNaN(value.getTime())
    ? "—"
    : value.toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short" });
};

export function UserHistoryModal({
  data,
  loading,
  error,
  onClose,
}: {
  data: any;
  loading: boolean;
  error?: string;
  onClose: () => void;
}) {
  return (
    <div className="history-overlay" role="presentation" onMouseDown={onClose}>
      <section
        className="history-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-history-title"
        onMouseDown={event => event.stopPropagation()}
      >
        <header className="history-dialog-head">
          <div>
            <p className="page-eyebrow">Private administrator view</p>
            <h2 id="user-history-title">
              {data?.user?.name ?? "Account transaction history"}
            </h2>
            <p>{data?.user?.email ?? "Up to 100 recent rows in each section"}</p>
          </div>
          <button
            className="topbar-icon"
            onClick={onClose}
            aria-label="Close history"
          >
            <X size={17} />
          </button>
        </header>
        {loading ? (
          <p className="muted">Loading account records…</p>
        ) : error ? (
          <div className="notice">
            <ShieldCheck size={16} />
            <span>{error}</span>
          </div>
        ) : !data ? (
          <p className="muted">No account history is available.</p>
        ) : (
          <div className="history-sections">
            <section>
              <h3>Wallet ledger</h3>
              {!data.ledger.length ? (
                <p className="small-muted">No ledger entries.</p>
              ) : (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Entry</th>
                        <th>Amount</th>
                        <th>Reference / note</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.ledger.map((row: any) => (
                        <tr key={row.id}>
                          <td>{date(row.createdAt)}</td>
                          <td>
                            {row.kind} · {row.direction}
                          </td>
                          <td>{formatKes(row.amountMinor)}</td>
                          <td>
                            {row.referenceType
                              ? `${row.referenceType} #${row.referenceId ?? "—"}`
                              : "—"}
                            <small className="table-subline">{row.note}</small>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
            <section>
              <h3>M-Pesa payment attempts</h3>
              {!data.payments.length ? (
                <p className="small-muted">No M-Pesa attempts.</p>
              ) : (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Purpose / status</th>
                        <th>Amount / phone</th>
                        <th>Receipt / provider result</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.payments.map((row: any) => (
                        <tr key={row.id}>
                          <td>{date(row.createdAt)}</td>
                          <td>
                            {row.purpose} · {row.status}
                          </td>
                          <td>
                            {formatKes(row.amountMinor)}
                            <small className="table-subline">{row.phone}</small>
                          </td>
                          <td>
                            {row.receipt ?? "Receipt not recorded"}
                            <small className="table-subline">
                              {row.resultDescription ?? "Awaiting provider result"}
                            </small>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
            <section>
              <h3>Withdrawals</h3>
              {!data.withdrawals.length ? (
                <p className="small-muted">No withdrawal requests.</p>
              ) : (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Status</th>
                        <th>Requested / fee / payout</th>
                        <th>M-Pesa / note</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.withdrawals.map((row: any) => (
                        <tr key={row.id}>
                          <td>{date(row.createdAt)}</td>
                          <td>{row.status}</td>
                          <td>
                            {formatKes(row.amountMinor)} / {formatKes(row.feeMinor)} / {formatKes(row.payoutMinor)}
                          </td>
                          <td>
                            {row.mpesaPhone}
                            <small className="table-subline">
                              {row.payoutReference ?? row.adminNote ?? "No payout reference"}
                            </small>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        )}
      </section>
    </div>
  );
}
