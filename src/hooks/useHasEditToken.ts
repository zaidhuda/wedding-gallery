import { STORED_EDIT_TOKENS } from './useLocalStorage';

export default function useEditTokens() {
  const addEditToken = (token: string) => {
    localStorage.setItem(
      STORED_EDIT_TOKENS,
      (localStorage.getItem(STORED_EDIT_TOKENS) || '') + token + ',',
    );
  };

  const hasEditToken = (token?: string) => {
    return (
      !!token &&
      (localStorage.getItem(STORED_EDIT_TOKENS) || '').includes(token)
    );
  };

  return {
    hasEditToken,
    addEditToken,
  };
}
