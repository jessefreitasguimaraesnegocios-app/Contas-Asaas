/** Apenas dígitos */
export function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

/** CPF: 000.000.000-00 (11 dígitos) */
export function maskCpf(value: string): string {
  const d = onlyDigits(value).slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/** CNPJ: 00.000.000/0000-00 (14 dígitos) */
export function maskCnpj(value: string): string {
  const d = onlyDigits(value).slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

/** CPF ou CNPJ: até 11 dígitos = CPF, acima = CNPJ */
export function maskCpfCnpj(value: string): string {
  const d = onlyDigits(value);
  if (d.length <= 11) return maskCpf(value);
  return maskCnpj(value);
}

/** Telefone fixo: (00) 0000-0000 (10 dígitos) */
export function maskPhone(value: string): string {
  const d = onlyDigits(value).slice(0, 10);
  if (d.length <= 2) return d.length ? `(${d}` : d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
}

/** Celular: (00) 00000-0000 (11 dígitos) */
export function maskMobile(value: string): string {
  const d = onlyDigits(value).slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : d;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** CEP: 00000-000 (8 dígitos) */
export function maskCep(value: string): string {
  const d = onlyDigits(value).slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

/** Data BR: DD/MM/AAAA (8 dígitos) */
export function maskDateBr(value: string): string {
  const d = onlyDigits(value).slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

/** Converte DD/MM/AAAA -> AAAA-MM-DD (ou null se incompleta) */
export function brDateToIso(value: string): string | null {
  const d = onlyDigits(value);
  if (d.length !== 8) return null;
  const dd = d.slice(0, 2);
  const mm = d.slice(2, 4);
  const yyyy = d.slice(4, 8);
  return `${yyyy}-${mm}-${dd}`;
}

function randomDigits(count: number): string {
  let out = '';
  for (let i = 0; i < count; i++) out += String(Math.floor(Math.random() * 10));
  return out;
}

// Retorna CPF no formato mascarado: 000.000.000-00
export function generateCpfMasked(): string {
  const base = randomDigits(9);
  const digits = base.split('').map((n) => Number(n));

  let sum1 = 0;
  for (let i = 0; i < 9; i++) sum1 += digits[i] * (10 - i);
  let d1 = (sum1 * 10) % 11;
  if (d1 === 10) d1 = 0;

  let sum2 = 0;
  for (let i = 0; i < 9; i++) sum2 += digits[i] * (11 - i);
  sum2 += d1 * 2;
  let d2 = (sum2 * 10) % 11;
  if (d2 === 10) d2 = 0;

  return maskCpf(`${base}${d1}${d2}`);
}

// Retorna CNPJ no formato mascarado: 00.000.000/0000-00
export function generateCnpjMasked(): string {
  const base = randomDigits(12);
  const digits = base.split('').map((n) => Number(n));

  const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let sum1 = 0;
  for (let i = 0; i < 12; i++) sum1 += digits[i] * weights1[i];
  let d1 = sum1 % 11;
  if (d1 < 2) d1 = 0;
  else d1 = 11 - d1;

  const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let sum2 = 0;
  for (let i = 0; i < 12; i++) sum2 += digits[i] * weights2[i];
  sum2 += d1 * weights2[12];
  let d2 = sum2 % 11;
  if (d2 < 2) d2 = 0;
  else d2 = 11 - d2;

  return maskCnpj(`${base}${d1}${d2}`);
}

export type ViaCepResponse = {
  cep: string;
  logradouro: string;
  complemento: string;
  bairro: string;
  localidade: string;
  uf: string;
  erro?: boolean;
};

/** Busca endereço pelo CEP (ViaCEP). CEP deve ter 8 dígitos. */
export async function fetchByCep(cep: string): Promise<ViaCepResponse | null> {
  const digits = onlyDigits(cep);
  if (digits.length !== 8) return null;
  const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
  const data: ViaCepResponse = await res.json();
  if (data.erro) return null;
  return data;
}
