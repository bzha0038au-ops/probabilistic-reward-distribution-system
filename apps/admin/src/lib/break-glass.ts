export type BreakGlassActionPolicy = {
  requireBreakGlass: boolean
  title?: string
  description?: string
  confirmLabel?: string
}

export type BreakGlassActionPolicies = Record<string, BreakGlassActionPolicy>

type SubmitterElement = HTMLButtonElement | HTMLInputElement | null

export type PendingBreakGlassSubmission = {
  actionName: string
  form: HTMLFormElement
  submitter: SubmitterElement
  policy: BreakGlassActionPolicy
}

const readActionValue = (
  form: HTMLFormElement,
  submitter: SubmitterElement,
) => submitter?.getAttribute("formaction") ?? form.getAttribute("action")

export const normalizeActionName = (value: string | null | undefined) => {
  const trimmed = value?.trim() ?? ""
  if (trimmed === "") {
    return null
  }

  const submitActionMatch = trimmed.match(/\?\/([^/?#]+)/)
  if (submitActionMatch?.[1]) {
    return submitActionMatch[1]
  }

  return trimmed.replace(/^\?\/?/, "")
}

export const resolvePendingBreakGlassSubmission = (
  event: SubmitEvent,
  policies: BreakGlassActionPolicies,
): PendingBreakGlassSubmission | null => {
  const form = event.target
  if (!(form instanceof HTMLFormElement)) {
    return null
  }

  const submitter =
    event.submitter instanceof HTMLButtonElement ||
    event.submitter instanceof HTMLInputElement
      ? event.submitter
      : null
  const actionName = normalizeActionName(readActionValue(form, submitter))
  if (!actionName) {
    return null
  }

  const policy = policies[actionName]
  if (!policy?.requireBreakGlass) {
    return null
  }

  return {
    actionName,
    form,
    submitter,
    policy,
  }
}

export const upsertHiddenFormValue = (
  form: HTMLFormElement,
  name: string,
  value: string,
) => {
  let input = form.querySelector<HTMLInputElement>(
    `input[type="hidden"][name="${name}"]`,
  )

  if (!input) {
    input = document.createElement("input")
    input.type = "hidden"
    input.name = name
    form.append(input)
  }

  input.value = value
}
