import { useQuery } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import { FormEvent, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { useI18n } from "./i18n";
import { getMe, login, logout, type AuthUser } from "./lib/api";
import { CustomerPaymentsPage } from "./pages/CustomerPaymentsPage";
import { CustomerStatementPrintPage } from "./pages/CustomerStatementPrintPage";
import { CustomerStatementsPage } from "./pages/CustomerStatementsPage";
import { CustomersPage } from "./pages/CustomersPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ExpensesPage } from "./pages/ExpensesPage";
import { FinishedInventoryPage } from "./pages/FinishedInventoryPage";
import { MaterialReceivingsPage } from "./pages/MaterialReceivingsPage";
import { MaterialsPage } from "./pages/MaterialsPage";
import { ModelsPage } from "./pages/ModelsPage";
import { ProductionBatchesPage } from "./pages/ProductionBatchesPage";
import { ProductionCostReportsPage } from "./pages/ProductionCostReportsPage";
import { SafesPage } from "./pages/SafesPage";
import { SalesInvoicesPage } from "./pages/SalesInvoicesPage";
import { SalesInvoicePrintPage } from "./pages/SalesInvoicePrintPage";
import { SettingsPage } from "./pages/SettingsPage";
import { StockReportsPage } from "./pages/StockReportsPage";
import { StockMovementReportsPage } from "./pages/StockMovementReportsPage";
import { SupplierPaymentsPage } from "./pages/SupplierPaymentsPage";
import { SupplierStatementPrintPage } from "./pages/SupplierStatementPrintPage";
import { SupplierStatementsPage } from "./pages/SupplierStatementsPage";
import { SuppliersPage } from "./pages/SuppliersPage";
import { TreasuryPage } from "./pages/TreasuryPage";

export function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loginError, setLoginError] = useState("");

  const meQuery = useQuery({
    queryKey: ["auth", "me"],
    queryFn: getMe,
    retry: false,
    enabled: Boolean(localStorage.getItem("auth.token"))
  });

  const activeUser = user ?? meQuery.data ?? null;

  function handleLogout() {
    logout();
    setUser(null);
    window.location.hash = "/";
  }

  if (!activeUser) {
    return <LoginPage onLogin={setUser} error={loginError} setError={setLoginError} />;
  }

  return (
    <Routes>
      <Route element={<AppShell user={activeUser} onLogout={handleLogout} />}>
        <Route index element={<DashboardPage />} />
        <Route path="customers" element={<CustomersPage />} />
        <Route path="sales-invoices" element={<SalesInvoicesPage />} />
        <Route path="sales-invoices/:id/print" element={<SalesInvoicePrintPage />} />
        <Route path="customer-payments" element={<CustomerPaymentsPage />} />
        <Route path="customer-statements" element={<CustomerStatementsPage />} />
        <Route path="customer-statements/:id/print" element={<CustomerStatementPrintPage />} />
        <Route path="suppliers" element={<SuppliersPage />} />
        <Route path="supplier-statements" element={<SupplierStatementsPage />} />
        <Route path="supplier-statements/:id/print" element={<SupplierStatementPrintPage />} />
        <Route path="materials" element={<MaterialsPage />} />
        <Route path="material-receivings" element={<MaterialReceivingsPage />} />
        <Route path="supplier-payments" element={<SupplierPaymentsPage />} />
        <Route path="production-batches" element={<ProductionBatchesPage />} />
        <Route path="production-costs" element={<ProductionCostReportsPage />} />
        <Route path="finished-inventory" element={<FinishedInventoryPage />} />
        <Route path="expenses" element={<ExpensesPage />} />
        <Route path="treasury" element={<TreasuryPage />} />
        <Route path="stock-reports" element={<StockReportsPage />} />
        <Route path="stock-movements" element={<StockMovementReportsPage />} />
        <Route path="models" element={<ModelsPage />} />
        <Route path="safes" element={<SafesPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate replace to="/" />} />
      </Route>
    </Routes>
  );
}

function LoginPage({
  onLogin,
  error,
  setError
}: {
  onLogin: (user: AuthUser) => void;
  error: string;
  setError: (error: string) => void;
}) {
  const { t, lang, setLanguage } = useI18n();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("Admin_12345");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");

    try {
      const result = await login(username, password);
      onLogin(result.user);
    } catch {
      setError(t("auth.invalid"));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="login-icon">
          <Lock aria-hidden="true" />
        </div>
        <p className="eyebrow">{t("auth.appName")}</p>
        <h1>{t("auth.signIn")}</h1>
        <p className="login-help">{t("auth.signInHelp")}</p>

        <button
          type="button"
          className="ghost-button"
          style={{ alignSelf: "flex-start" }}
          onClick={() => setLanguage(lang === "ar" ? "en" : "ar")}
        >
          {lang === "ar" ? t("language.switchToEnglish") : t("language.switchToArabic")}
        </button>

        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}

        <label>
          {t("auth.username")}
          <input
            autoComplete="username"
            dir="ltr"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
        </label>

        <label>
          {t("auth.password")}
          <input
            autoComplete="current-password"
            dir="ltr"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>

        <button disabled={isSubmitting} type="submit">
          {isSubmitting ? t("auth.signingIn") : t("auth.signIn")}
        </button>
      </form>
    </main>
  );
}
