import { useState } from "react";
import NewOrderPage from "./pages/NewOrderPage.jsx";
import AuthPage from "./pages/AuthPage.jsx";
import InvoicesOrdersPage from "./pages/InvoicesOrdersPage.jsx";
import AiInvoicePage from "./pages/AiInvoicePage.jsx";
import SupplierLedgerPage from "./pages/SupplierLedgerPage.jsx";
// import
import StockPage from "./pages/StockPage.jsx";


function App() {
  const [activeTab, setActiveTab] = useState("new-order");
  const [currentFlorist, setCurrentFlorist] = useState(null); // {id, full_name, username}

  // لو ما فيه مستخدم مسجل → نعرض صفحة الدخول
  if (!currentFlorist) {
    return <AuthPage onLogin={setCurrentFlorist} />;
  }

  return (
    <div className="min-h-screen flex bg-stone-100">
      {/* Sidebar */}
      <aside className="w-64 bg-amber-50 border-r border-amber-100 flex flex-col">
        <div className="px-6 py-4 border-b border-amber-100">
          <h1 className="text-xl font-bold text-amber-800 tracking-tight">
            Flower Shop POS
          </h1>
          <p className="text-xs text-amber-700/70 mt-1">
            Florist workflow & sales
          </p>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-2">
          <button
            onClick={() => setActiveTab("new-order")}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition ${
              activeTab === "new-order"
                ? "bg-amber-200/70 text-amber-900 shadow-sm"
                : "text-stone-700 hover:bg-amber-100"
            }`}
          >
            New Order
          </button>

          <button
            onClick={() => setActiveTab("orders")}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition ${
              activeTab === "orders"
                ? "bg-amber-200/70 text-amber-900 shadow-sm"
                : "text-stone-700 hover:bg-amber-100"
            }`}
          >
            Invoices & Orders
          </button>

          <button
            onClick={() => setActiveTab("reports")}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition ${
              activeTab === "reports"
                ? "bg-amber-200/70 text-amber-900 shadow-sm"
                : "text-stone-700 hover:bg-amber-100"
            }`}
          >
            Reports
          </button>

          <button
            onClick={() => setActiveTab("stocks")}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition ${
              activeTab === "stocks"
                ? "bg-amber-200/70 text-amber-900 shadow-sm"
                : "text-stone-700 hover:bg-amber-100"
            }`}
          >
            Stock & Products
          </button>
 <button
            onClick={() => setActiveTab("supplier-ledger")}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition ${
              activeTab === "supplier-ledger"
                ? "bg-amber-200/70 text-amber-900 shadow-sm"
                : "text-stone-700 hover:bg-amber-100"
            }`}
          >
           supplier Ledger
          </button>

          <button
            onClick={() => setActiveTab("ai-invoices")}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition ${
              activeTab === "ai-invoices"
                ? "bg-amber-200/70 text-amber-900 shadow-sm"
                : "text-stone-700 hover:bg-amber-100"
            }`}
          >
            AI Purchase Invoices
          </button>

        </nav>

        <div className="px-4 py-3 border-t border-amber-100 text-xs text-stone-500">
          Logged in as:{" "}
          <span className="font-medium text-stone-700">
            {currentFlorist.full_name} (ID: {currentFlorist.id})
          </span>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col">
        {/* Topbar */}
        <header className="h-16 bg-amber-50/60 border-b border-amber-100 flex items-center justify-between px-6">
          <h2 className="text-lg font-semibold text-stone-800">
            {activeTab === "new-order" && "New Order"}
            {activeTab === "orders" && "Invoices & Orders"}
            {activeTab === "reports" && "Reports & Analytics"}
            {activeTab === "stocks" && "Stock & Products"}
            {activeTab === "ai-invoices" && "AI Purchase Invoices"}
            {activeTab === "supplier-ledger" && "Supplier Ledger"}
          </h2>
        </header>

        <section className="flex-1 p-6 overflow-auto">
          {activeTab === "new-order" && (
            <NewOrderPage florist={currentFlorist} />
          )}
          {activeTab === "orders" && (
            <div className="text-stone-600">
             <InvoicesOrdersPage florist={currentFlorist} />
            </div>
          )}
          {activeTab === "reports" && (
            <div className="text-stone-600">
              Reports dashboard will go here (later).
            </div>
          )}
          {activeTab === "stocks" && (
            <div className="text-stone-600">
              <StockPage florist={currentFlorist} />
            </div>
          )}
          {activeTab === "ai-invoices" && (
            <div className="text-stone-600">
              <AiInvoicePage florist={currentFlorist} />
            </div>
          )}
          {activeTab === "supplier-ledger" && (
            <div className="text-stone-600">
              <SupplierLedgerPage florist={currentFlorist} />
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default App;
