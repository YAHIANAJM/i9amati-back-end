import z from "zod";

const validatePagination = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(30).optional(),
});

const validatePaymentsQuery = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(30).optional(),
});

export { validatePagination, validatePaymentsQuery };
