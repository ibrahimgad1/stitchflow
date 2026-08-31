import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { FileText } from "lucide-react";
import { Link } from "react-router-dom";
import {
  ListPageShell,
  PaginationBar,
  useDebouncedValue
} from "../components/ListPageShell";
import { useI18n } from "../i18n";
import { formatMoney, listCustomers } from "../lib/master-data";
import { getCustomerLedger, listCustomerSalesInvoices } from "../lib/sales";

function entryKindLabel(sourceType: string, t: (k: string) => string): string {
  switch (sourceType) {
    case "sales_invoice":
      return t("sales.title");
    case "sales_invoice_cancel":
      return t("sales.details.cancel");
    case "customer_payment":
      return t("customerPayments.title");
    case "customer_payment_reversal":
      return t("customerPayments.reverse.title");
    default:
      return sourceType;
  }
}

export function CustomerStatementsPage() {
  const { t } = useI18n();
  const [customerPage, setCustomerPage] = useState(1);
  const [ledgerPage, setLedgerPage] = useState(1);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

  const customersQuery = useQuery({
    queryKey: ["customers", "statements", customerPage, debouncedSearch],
    queryFn: () => listCustomers({ page: customerPage, pageSize: 12, search: debouncedSearch })
  });

  const ledgerQuery = useQuery({
    queryKey: ["customer-ledger", selectedCustomerId, ledgerPage],
    queryFn: () => getCustomerLedger(selectedCustomerId!, { page: ledgerPage, pageSize: 50 }),
    enabled: Boolean(selectedCustomerId)
  });

  const openInvoicesQuery = useQuery({
    queryKey: ["customer-open-invoices", selectedCustomerId],
    queryFn: () => listCustomerSalesInvoices(selectedCustomerId!, { page: 1, pageSize: 100 }),
    enabled: Boolean(selectedCustomerId)
  });

  const customers = customersQuery.data?.data ?? [];
  const customerMeta = customersQuery.data?.meta;
  const ledgerMeta = ledgerQuery.data?.meta;
  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.id === selectedCustomerId),
    [customers, selectedCustomerId]
  );
  const openTotalMinor = (openInvoicesQuery.data?.data ?? []).reduce(
    (sum, invoice) => sum + invoice.remainingMinor,
    0
  );

  return (
    <ListPageShell
      title={t("statements.titleCustomer")}
      description={t("statements.description")}
      search={search}
      onSearchChange={(value) => {
        setSearch(value);
        setCustomerPage(1);
      }}
      footer={
        customerMeta ? (
          <PaginationBar
            page={customerMeta.page}
            total={customerMeta.total}
            totalPages={customerMeta.totalPages}
            onPageChange={setCustomerPage}
          />
        ) : null
      }
    >
      <div className="split-panel">
        <section className="panel-list" aria-label={t("customers.title")}>
          {customersQuery.isLoading ? (
            <p>{t("statements.loading")}</p>
          ) : customers.length === 0 ? (
            <p>{t("customers.noCustomers")}</p>
          ) : (
            customers.map((customer) => (
              <button
                className={customer.id === selectedCustomerId ? "select-row active" : "select-row"}
                key={customer.id}
                type="button"
                onClick={() => {
                  setSelectedCustomerId(customer.id);
                  setLedgerPage(1);
                }}
              >
                <span>{customer.companyName}</span>
                <small dir="ltr">{customer.phone || t("common.none")}</small>
              </button>
            ))
          )}
        </section>

        <section className="statement-panel" aria-label={t("statements.titleCustomer")}>
          {selectedCustomerId ? (
            <>
              <div className="statement-header">
                <div>
                  <p className="eyebrow">{t("statements.statementFor")}</p>
                  <h3>{selectedCustomer?.companyName ?? t("statements.selectCustomer")}</h3>
                </div>
                <Link className="ghost-button" to={`/customer-statements/${selectedCustomerId}/print`}>
                  <FileText aria-hidden="true" />
                  {t("statements.print")}
                </Link>
              </div>

              <div className="summary-strip">
                <div>
                  <span>{t("statements.balance")}</span>
                  <strong dir="ltr">{formatMoney(ledgerQuery.data?.balanceMinor ?? 0)}</strong>
                </div>
                <div>
                  <span>{t("sales.remaining")}</span>
                  <strong dir="ltr">{formatMoney(openTotalMinor)}</strong>
                </div>
                <div>
                  <span>{t("statements.summary")}</span>
                  <strong dir="ltr">{ledgerMeta?.total ?? 0}</strong>
                </div>
              </div>

              <table>
                <thead>
                  <tr>
                    <th>{t("statements.date")}</th>
                    <th>{t("statements.source")}</th>
                    <th>{t("common.description")}</th>
                    <th>{t("statements.debit")}</th>
                    <th>{t("statements.credit")}</th>
                    <th>{t("statements.balance")}</th>
                  </tr>
                </thead>
                <tbody>
                  {ledgerQuery.isLoading ? (
                    <tr>
                      <td colSpan={6}>{t("statements.loading")}</td>
                    </tr>
                  ) : (ledgerQuery.data?.data ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={6}>{t("statements.noEntries")}</td>
                    </tr>
                  ) : (
                    (ledgerQuery.data?.data ?? []).map((entry) => (
                      <tr key={entry.id}>
                        <td dir="ltr">{entry.entryDate}</td>
                        <td>{entryKindLabel(entry.sourceType, t)}</td>
                        <td>{entry.description}</td>
                        <td dir="ltr">{entry.debitMinor ? formatMoney(entry.debitMinor) : "-"}</td>
                        <td dir="ltr">{entry.creditMinor ? formatMoney(entry.creditMinor) : "-"}</td>
                        <td dir="ltr">{formatMoney(entry.balanceAfterMinor)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>

              {ledgerMeta ? (
                <PaginationBar
                  page={ledgerMeta.page}
                  total={ledgerMeta.total}
                  totalPages={ledgerMeta.totalPages}
                  onPageChange={setLedgerPage}
                />
              ) : null}
            </>
          ) : (
            <div className="empty-state">
              <FileText aria-hidden="true" />
              <p>{t("statements.selectCustomer")}</p>
            </div>
          )}
        </section>
      </div>
    </ListPageShell>
  );
}
