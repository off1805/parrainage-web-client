import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("show", "routes/show.tsx"),
  route("remote", "routes/remote.tsx"),
  route("invitation", "routes/invitation.tsx"),
] satisfies RouteConfig;
