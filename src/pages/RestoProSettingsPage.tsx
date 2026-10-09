import { useEffect, useState, type FormEvent } from "react";
import { PageHeader } from "../components/PageHeader";
import { supabase } from "../lib/supabase";
import { userMessageFromError } from "../lib/errors";
import { APP_IDENTIFIER, APP_NAME, APP_VERSION } from "../lib/version";
import {
  isValidRestaurantSettings,
  needsRestaurantOnboarding,
  type RestaurantSettings,
} from "../lib/settings";
import { useAuth } from "../contexts/AuthContext";
import { useRestaurantSettings } from "../contexts/RestaurantSettingsContext";
import { UpdatePanel } from "../components/UpdatePanel";
import {
  listAvailablePrinters,
  loadPrintPreferences,
  printerErrorMessage,
  savePrintPreferences,
  type PrintPreferences,
} from "../lib/printer";

export function SettingsPage() {
  const { profile } = useAuth();
  const { settings: sharedSettings, setSettings: saveSharedSettings } = useRestaurantSettings();
  const [settings, setSettings] = useState(sharedSettings);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [printSettings, setPrintSettings] = useState<PrintPreferences>(() =>
    loadPrintPreferences(),
  );
  const [printers, setPrinters] = useState<string[]>([]);
  const [printerError, setPrinterError] = useState("");
  const [printerSaved, setPrinterSaved] = useState(false);
  useEffect(() => setSettings(sharedSettings), [sharedSettings]);
  const refreshPrinters = async () => {
    setPrinterError("");
    try {
      setPrinters(await listAvailablePrinters());
    } catch (caught) {
      setPrinterError(printerErrorMessage(caught, "Impossible de lire les imprimantes Windows."));
    }
  };
  useEffect(() => {
    void refreshPrinters();
  }, []);
  const set = (key: keyof RestaurantSettings, value: string | number | boolean) =>
    setSettings((current) => ({ ...current, [key]: value }));
  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSaved(false);
    if (!isValidRestaurantSettings(settings)) {
      setError("Le nom, la devise, le pied de ticket et la largeur doivent être valides.");
      return;
    }
    const payload = { ...settings, onboarding_completed: true };
    const { data, error: failure } = await supabase.rpc("update_restaurant_settings", {
      p_settings: payload,
    });
    if (failure) setError(userMessageFromError(failure));
    else {
      const savedSettings = data as RestaurantSettings;
      setSettings(savedSettings);
      saveSharedSettings(savedSettings);
      setSaved(true);
    }
  };
  const setPrint = <Key extends keyof PrintPreferences>(key: Key, value: PrintPreferences[Key]) =>
    setPrintSettings((current) => ({ ...current, [key]: value }));
  const savePrinterSettings = () => {
    setPrinterError("");
    setPrinterSaved(false);
    if (printSettings.silent && !printSettings.printerName.trim()) {
      setPrinterError("Sélectionnez une imprimante tickets pour le mode silencieux.");
      return;
    }
    setPrintSettings(savePrintPreferences(printSettings));
    setPrinterSaved(true);
  };
  return (
    <>
      <PageHeader
        title="Paramètres"
        description="Identité du restaurant, impression, sauvegardes et version."
      />
      {needsRestaurantOnboarding(settings) && (
        <section className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <h2 className="font-black text-amber-900">Bienvenue dans RestoPRO</h2>
          <p className="mt-2 text-sm text-amber-800">
            Complétez l’identité du restaurant, vérifiez le pied et la largeur des tickets, puis
            enregistrez. Cette étape termine l’initialisation de cet établissement.
          </p>
        </section>
      )}
      <div className="grid gap-5 xl:grid-cols-2">
        <form className="card space-y-4 p-5" onSubmit={save}>
          <h2 className="font-black">Restaurant et tickets</h2>
          <input
            className="field"
            value={settings.nom}
            onChange={(e) => set("nom", e.target.value)}
            placeholder="Nom du restaurant"
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              className="field"
              value={settings.telephone || ""}
              onChange={(e) => set("telephone", e.target.value)}
              placeholder="Téléphone"
            />
            <input
              className="field"
              type="email"
              value={settings.email || ""}
              onChange={(e) => set("email", e.target.value)}
              placeholder="Email"
            />
          </div>
          <input
            className="field"
            value={settings.adresse || ""}
            onChange={(e) => set("adresse", e.target.value)}
            placeholder="Adresse"
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              className="field"
              value={settings.ville || ""}
              onChange={(e) => set("ville", e.target.value)}
              placeholder="Ville"
            />
            <input
              className="field"
              value={settings.pays || ""}
              onChange={(e) => set("pays", e.target.value)}
              placeholder="Pays"
            />
          </div>
          <input
            className="field"
            value={settings.slogan || ""}
            onChange={(e) => set("slogan", e.target.value)}
            placeholder="Slogan"
          />
          <input
            className="field"
            value={settings.logo_url || ""}
            onChange={(e) => set("logo_url", e.target.value)}
            placeholder="URL du logo du restaurant (facultatif)"
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              className="field"
              value={settings.devise}
              onChange={(e) => set("devise", e.target.value)}
              placeholder="Devise"
            />
            <input
              className="field"
              value={settings.numero_fiscal || ""}
              onChange={(e) => set("numero_fiscal", e.target.value)}
              placeholder="Numéro fiscal"
            />
          </div>
          <textarea
            className="field"
            value={settings.pied_ticket}
            onChange={(e) => set("pied_ticket", e.target.value)}
            placeholder="Pied de ticket"
          />
          <select
            className="field"
            value={settings.largeur_ticket}
            onChange={(e) => set("largeur_ticket", Number(e.target.value))}
          >
            <option value={80}>Ticket 80 mm</option>
            <option value={58}>Ticket 58 mm</option>
          </select>
          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={settings.show_restopro_branding}
              onChange={(e) => set("show_restopro_branding", e.target.checked)}
            />
            Afficher « Généré avec RestoPRO » sur les documents
          </label>
          {error && <p className="text-sm text-red-700">{error}</p>}
          {saved && (
            <p className="text-sm text-emerald-700">
              Paramètres enregistrés et initialisation terminée.
            </p>
          )}
          <button disabled={profile?.role !== "admin"} className="btn-primary">
            Enregistrer
          </button>
          {profile?.role !== "admin" && (
            <p className="text-xs text-slate-500">Modification réservée aux administrateurs.</p>
          )}
        </form>
        <div className="space-y-5">
          <section className="card space-y-4 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-black">Impression Windows</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Ces préférences restent sur cet ordinateur et ne sont pas envoyées à Supabase.
                </p>
              </div>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => void refreshPrinters()}
              >
                Actualiser les imprimantes
              </button>
            </div>
            <label className="flex items-center gap-3 text-sm font-semibold">
              <input
                type="checkbox"
                checked={printSettings.silent}
                onChange={(event) => setPrint("silent", event.target.checked)}
              />
              Impression silencieuse
            </label>
            <div>
              <label className="label" htmlFor="ticket-printer">
                Imprimante tickets
              </label>
              <select
                id="ticket-printer"
                className="field"
                value={printSettings.printerName}
                onChange={(event) => setPrint("printerName", event.target.value)}
              >
                <option value="">Choisir une imprimante…</option>
                {printSettings.printerName && !printers.includes(printSettings.printerName) && (
                  <option value={printSettings.printerName}>
                    {printSettings.printerName} — indisponible
                  </option>
                )}
                {printers.map((printer) => (
                  <option key={printer} value={printer}>
                    {printer}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="local-ticket-width">
                  Largeur
                </label>
                <select
                  id="local-ticket-width"
                  className="field"
                  value={printSettings.widthMm}
                  onChange={(event) =>
                    setPrint("widthMm", Number(event.target.value) === 58 ? 58 : 80)
                  }
                >
                  <option value={58}>58 mm</option>
                  <option value={80}>80 mm</option>
                </select>
              </div>
              <div>
                <label className="label" htmlFor="ticket-copies">
                  Nombre de copies
                </label>
                <input
                  id="ticket-copies"
                  className="field"
                  type="number"
                  min="1"
                  max="5"
                  step="1"
                  value={printSettings.copies}
                  onChange={(event) => setPrint("copies", Number(event.target.value))}
                />
              </div>
            </div>
            <label className="flex items-center gap-3 text-sm font-semibold">
              <input
                type="checkbox"
                checked={printSettings.autoPrint}
                onChange={(event) => setPrint("autoPrint", event.target.checked)}
              />
              Imprimer automatiquement après encaissement
            </label>
            {printerError && (
              <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{printerError}</p>
            )}
            {printerSaved && (
              <p className="text-sm font-semibold text-emerald-700">
                Préférences d’impression enregistrées sur ce poste.
              </p>
            )}
            <button type="button" className="btn-primary" onClick={savePrinterSettings}>
              Enregistrer l’impression
            </button>
          </section>
          <section className="card p-5">
            <h2 className="font-black">À propos de {APP_NAME}</h2>
            <p className="mt-3 text-2xl font-black">{APP_NAME}</p>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="font-semibold">Version</dt>
              <dd>{APP_VERSION}</dd>
              <dt className="font-semibold">Édition</dt>
              <dd>Desktop professionnelle</dd>
              <dt className="font-semibold">Canal</dt>
              <dd>Stable</dd>
              <dt className="font-semibold">Identifiant</dt>
              <dd className="break-all">{APP_IDENTIFIER}</dd>
              <dt className="font-semibold">Restaurant</dt>
              <dd>{settings.nom}</dd>
            </dl>
            <p className="mt-4 text-sm text-slate-600">
              RestoPRO centralise les ventes, la caisse, le stock, les achats, les clients et les
              rapports de votre établissement.
            </p>
            <UpdatePanel />
          </section>
          <section className="card p-5">
            <h2 className="font-black">Sauvegardes</h2>
            <p className="mt-2 text-sm text-slate-600">
              Les exports fonctionnels sont disponibles dans Rapports. Une sauvegarde complète doit
              être réalisée via Supabase ou <code>pg_dump</code> depuis un environnement
              administrateur sécurisé, jamais depuis le navigateur.
            </p>
          </section>
        </div>
      </div>
    </>
  );
}
