// access-control-svc: the governed register of role DEFINITIONS and their
// permission bundles. Grants, separation of duties, conditions, delegation
// and the decision log are authorization-svc's — components/admin/authorization.
export { RoleCataloguePanel } from "./RoleCataloguePanel";
export { DefineRoleForm, UpdateRoleForm, AttachBundleForm } from "./AccessControlForms";
// Edits one existing bundle's actions, or detaches it from its role. Both are
// access-control-svc writes that propagate to authorization-svc and fail
// closed — see ManageBundleForms.tsx for why "detached" here always means
// "withdrawn there".
export { ManageBundleForms } from "./ManageBundleForms";
