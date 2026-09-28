/**
 * The animation feature bundle, in its own module so `LazyMotion` can pull it
 * in through a dynamic import.
 *
 * This is the whole reason the app uses `m.*` rather than `motion.*`: importing
 * `motion` directly bundles the full feature set (~34 kB gzipped) into whatever
 * chunk touches it, and on this app that chunk is the report page, which is
 * already the heaviest route. `m` ships the renderer only, and these features
 * arrive in a separate chunk after hydration — the first paint pays nothing.
 *
 * `domAnimation` and not `domMax`: the difference is layout projection and drag,
 * neither of which this UI does. It is roughly half the weight.
 */
export { domAnimation as default } from 'motion/react'
