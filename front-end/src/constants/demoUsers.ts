import type { AuthUser } from "../api/client";

export const DEMO_USERS: AuthUser[] = [
  {
    user_id: "demo-regulator",
    username: "regulator",
    display_name: "监管席位",
    role: "监管审计",
    org_name: "监管审计节点",
    permissions: ["approve_access", "view_raw_data", "view_trace", "close_case", "audit_chain"],
    home_path: "/workspace"
  },
  {
    user_id: "demo-airport",
    username: "airport_ops",
    display_name: "运控席位",
    role: "机场运控",
    org_name: "机场运控中心",
    permissions: ["raw_data_request", "dispatch_alert", "view_trace", "approve_schedule"],
    home_path: "/workspace"
  },
  {
    user_id: "demo-ground",
    username: "ground_ops",
    display_name: "地服席位",
    role: "地服公司",
    org_name: "地服保障中心",
    permissions: ["submit_execution", "view_masked_data", "view_trace", "respond_alert"],
    home_path: "/workspace"
  },
  {
    user_id: "demo-airline",
    username: "airline_ops",
    display_name: "航司席位",
    role: "航空公司",
    org_name: "航空公司协同席位",
    permissions: ["view_masked_data", "review_case", "request_access"],
    home_path: "/workspace"
  }
];

export function getDemoUserByRole(role?: string): AuthUser {
  return DEMO_USERS.find((item) => item.role === role) || DEMO_USERS[0];
}

export function getDefaultDemoUser(): AuthUser {
  return DEMO_USERS[0];
}
