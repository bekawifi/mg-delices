(() => {
  'use strict'

  const config = window.RESTOPRO_AUTH_CONFIG
  const form = document.getElementById('password-form')
  const message = document.getElementById('message')
  const submit = document.getElementById('submit')
  const success = document.getElementById('success')
  const fragment = new URLSearchParams(window.location.hash.slice(1))
  let accessToken = fragment.get('access_token') || ''
  const authFailed = Boolean(fragment.get('error') || fragment.get('error_description'))

  window.history.replaceState(null, '', window.location.pathname)

  const failLink = () => {
    form.classList.add('hidden')
    message.className = 'error'
    message.textContent = authFailed
      ? 'Le lien est invalide ou expiré. Demandez un nouvel envoi.'
      : 'Lien d’activation incomplet.'
  }

  if (!config || config.projectRef !== 'xtctfierkhvphfkuttsr' || !config.url || !config.publishableKey || !accessToken) {
    failLink()
    return
  }

  form.addEventListener('submit', async event => {
    event.preventDefault()
    const password = document.getElementById('password').value
    const confirmation = document.getElementById('confirmation').value
    if (password.length < 8 || password !== confirmation) {
      message.className = 'error'
      message.textContent = 'Les mots de passe doivent correspondre et contenir au moins 8 caractères.'
      return
    }

    submit.disabled = true
    message.className = 'muted'
    message.textContent = 'Mise à jour en cours…'
    try {
      const headers = {
        apikey: config.publishableKey,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      }
      const response = await fetch(`${config.url}/auth/v1/user`, {
        method: 'PUT', headers, body: JSON.stringify({ password }),
      })
      if (!response.ok) throw new Error('password_update_failed')
      await fetch(`${config.url}/auth/v1/logout?scope=local`, { method: 'POST', headers }).catch(() => {})
      accessToken = ''
      form.reset()
      form.classList.add('hidden')
      message.textContent = ''
      success.classList.remove('hidden')
    } catch {
      message.className = 'error'
      message.textContent = 'Impossible de finaliser ce lien. Demandez un nouvel envoi.'
      submit.disabled = false
    }
  })
})()
