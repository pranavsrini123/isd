// INVENTRA brand pieces shared by the welcome and login pages.
// data-brand attributes are the hooks the landing → login transition uses to
// find the "same" element on both pages (see lib/brandTransition.js).

export const ISD_LOGO_SRC = '/brand/isd-labs-logo.webp' // official ISD Labs badge (PNG copy alongside)

export function IsdLabsLogo({ className = 'h-16 w-16', ...rest }) {
  return (
    <img src={ISD_LOGO_SRC} alt="ISD Labs — Intelligent Systems Design Lab" width="384" height="384"
      className={`select-none rounded-full ${className}`} draggable="false" decoding="async" data-brand="logo" {...rest} />
  )
}

/** The INVENTRA wordmark. Sized with font-size so it stays text (crisp, selectable). */
export function Wordmark({ className = '', as: As = 'span', ...rest }) {
  return (
    <As data-brand="wordmark" className={`inline-block font-display font-extrabold uppercase leading-none tracking-[0.16em] [text-shadow:0_0_48px_rgb(34_211_238/0.35)] ${className}`} {...rest}>
      INVENTRA
    </As>
  )
}
