import { z } from "zod";

export const ServiceItemSchema = z.object({
  name: z.string().min(1, "Item name is required"),
  quantity: z.number().min(0),
  unitCost: z.number().min(0),
  type: z.enum(["part", "labor", "consumable"]),
  notes: z.string().optional(),
});

export const ServiceIntervalSchema = z.object({
  id: z.string(),
  name: z.string().min(1, "Interval name is required (e.g. 1 Year / 15,000km)"),
  months: z.number().min(0),
  kilometers: z.number().min(0),
  items: z.array(ServiceItemSchema),
  laborCost: z.number().min(0),
  partsCost: z.number().min(0),
  totalCost: z.number().min(0),
});

export const PowertrainSchema = z.object({
  id: z.string(),
  name: z.string().min(1, "Powertrain name is required"),
  engine: z.string().optional(),
  fuelType: z.string().optional(),
  transmission: z.string().optional(),
  driveTrain: z.string().optional(),
  intervals: z.array(ServiceIntervalSchema),
});

export const ModelSchema = z.object({
  id: z.string(),
  name: z.string().min(1, "Model name is required"),
  brandId: z.string(),
  powertrains: z.array(PowertrainSchema),
  ownershipSummary: z.object({
    years: z.number(),
    expectedMaintenanceCost: z.number(),
    pros: z.array(z.string()),
    cons: z.array(z.string()),
  }).optional(),
});

export const BrandSchema = z.object({
  id: z.string(),
  name: z.string().min(1, "Brand name is required"),
  country: z.string().optional(),
  logoUrl: z.string().url().optional(),
  lastUpdated: z.any().optional(),
});

export type ServiceItem = z.infer<typeof ServiceItemSchema>;
export type ServiceInterval = z.infer<typeof ServiceIntervalSchema>;
export type Powertrain = z.infer<typeof PowertrainSchema>;
export type VehicleModel = z.infer<typeof ModelSchema>;
export type Brand = z.infer<typeof BrandSchema>;
export type ImportLog = {
  id: string;
  userId: string;
  userEmail: string;
  timestamp: any;
  fileName: string;
  mode: string;
  results: {
    brands: number;
    models: number;
    powertrains: number;
    intervals: number;
  };
  errorCount: number;
};

// For recursive Import support
export const ImportSchema = z.array(z.object({
  brand: z.string().optional(),
  model: z.string().optional(),
  powertrain: z.string().optional(),
  kilometers: z.number().optional(),
  months: z.number().optional(),
  // Add more flexible fields for merging
}).passthrough());
