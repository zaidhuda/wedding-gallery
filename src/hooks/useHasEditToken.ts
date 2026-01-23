import { STORED_EDIT_TOKENS } from './useLocalStorage';

export default function useHasEditToken(token?: string) {
  if (!token) return false;
  const editTokens = JSON.parse(
    localStorage.getItem(STORED_EDIT_TOKENS) || '{}',
  );
  return editTokens[token] !== undefined;
}
