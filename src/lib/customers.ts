import { supabase } from "./supabase";
import type { Customer } from "../types/customers";

export interface CustomerFormData {
  nom: string;
  telephone: string;
  email: string;
  adresse: string;
  plafond_credit: number;
  actif: boolean;
}

export const EMPTY_CUSTOMER_FORM: CustomerFormData = {
  nom: "",
  telephone: "",
  email: "",
  adresse: "",
  plafond_credit: 0,
  actif: true,
};

export const customerSavePayload = (form: CustomerFormData, id: string | null = null) => ({
  p_id: id,
  p_nom: form.nom,
  p_telephone: form.telephone || null,
  p_email: form.email || null,
  p_adresse: form.adresse || null,
  p_plafond_credit: form.plafond_credit,
  p_actif: form.actif,
});

export async function saveCustomerRecord(form: CustomerFormData, id: string | null = null) {
  const { data, error } = await supabase.rpc("save_customer", customerSavePayload(form, id));
  if (error) throw error;
  return data as string;
}

export async function loadActiveCustomers() {
  const { data, error } = await supabase.rpc("get_customers_overview", {
    p_search: null,
    p_only_with_debt: false,
  });
  if (error) throw error;
  return ((data || []) as Customer[]).filter((customer) => customer.actif);
}

export async function createQuickCustomer(input: {
  nom: string;
  telephone: string;
  email: string;
}) {
  const id = await saveCustomerRecord({
    ...EMPTY_CUSTOMER_FORM,
    nom: input.nom,
    telephone: input.telephone,
    email: input.email,
  });
  const customers = await loadActiveCustomers();
  const customer = customers.find((item) => item.id === id);
  if (!customer) throw new Error("Le client créé n’a pas pu être rechargé.");
  return { customer, customers };
}

export function moveCustomerOption(current: number, key: "ArrowDown" | "ArrowUp", count: number) {
  if (count <= 0) return -1;
  if (key === "ArrowDown") return current < count - 1 ? current + 1 : 0;
  return current > 0 ? current - 1 : count - 1;
}
