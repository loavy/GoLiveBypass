try {
  document.documentElement.dataset.theme = localStorage.getItem('golivebypass-theme') === 'light' ? 'light' : 'dark';
} catch {
  document.documentElement.dataset.theme = 'dark';
}
