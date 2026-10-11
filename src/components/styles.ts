// Shared Tailwind class strings for form controls and buttons.
export const inputClass =
  'block w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm shadow-sm ' +
  'focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 ' +
  'disabled:bg-slate-50 disabled:text-slate-500 aria-[invalid=true]:border-red-500';

export const labelClass = 'block text-sm font-medium text-slate-700';

export const primaryButtonClass =
  'inline-flex items-center rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white ' +
  'shadow-sm hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50';

export const secondaryButtonClass =
  'inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm ' +
  'font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50';

export const dangerButtonClass =
  'inline-flex items-center rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white ' +
  'shadow-sm hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50';

export const errorTextClass = 'mt-1 text-sm text-red-600';
