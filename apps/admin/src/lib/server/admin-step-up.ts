export type AdminStepUpPayload = {
  totpCode: string | null
  breakGlassCode: string | null
}

export type AdminStepUpValidationMessages = {
  totpRequired: string
  breakGlassRequired: string
}

const parseOptionalString = (value: FormDataEntryValue | null) =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : null

export const parseAdminStepUpPayload = (
  formData: FormData,
): AdminStepUpPayload => ({
  totpCode: parseOptionalString(formData.get("totpCode")),
  breakGlassCode: parseOptionalString(formData.get("breakGlassCode")),
})

export const validateAdminStepUpPayload = (
  payload: AdminStepUpPayload,
  options: {
    requireBreakGlass?: boolean
    messages?: AdminStepUpValidationMessages
  } = {},
) => {
  const messages = options.messages ?? {
    totpRequired: "Admin MFA code is required.",
    breakGlassRequired: "Admin break-glass code is required.",
  }

  if (!payload.totpCode) {
    return messages.totpRequired
  }
  if (options.requireBreakGlass && !payload.breakGlassCode) {
    return messages.breakGlassRequired
  }
  return null
}
