import { type RouteConfig, index, layout, prefix, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("show", "routes/show.tsx"),
  route("remote", "routes/remote.tsx"),
  route("invitation", "routes/invitation.tsx"),
  ...prefix("admin", [
    layout("admin/layout.tsx", [
      index("admin/students.tsx"),
      route("contraintes", "admin/constraints.tsx"),
      route("sessions", "admin/sessions.tsx"),
    ]),
  ]),
] satisfies RouteConfig;
