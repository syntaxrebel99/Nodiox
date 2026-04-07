import * as React from "react"
import { cn } from "@nodiox/utils"

export function NodioxLogo({
  className,
  ...props
}: React.ComponentProps<"svg">) {
  return (
    <svg
      id="animated-logo"
      width="32"
      height="32"
      viewBox="-2 -2 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="presentation"
      aria-hidden="true"
      className={cn("cursor-pointer transition-transform duration-500 group-hover:rotate-90", className)}
      {...props}
    >
      {/* Main "X" Shape */}
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M0.476586 29.4544L2.54553 31.5234L6.97396 27.095C11.9647 22.12 20.0436 22.1248 25.0283 27.1096L29.4421 31.5234L31.5111 29.4544L27.0973 25.0406C22.1125 20.0559 22.1077 11.977 27.0826 6.98621L31.511 2.55778L29.4421 0.488761L25.0136 4.91724C20.0229 9.89225 11.9441 9.88738 6.95932 4.90262L2.54553 0.488813L0.476561 2.55779L4.89035 6.9716C9.87508 11.9563 9.87996 20.0352 4.90499 25.026L0.476586 29.4544Z"
        fill="currentColor"
      ></path>

      {/* Center Square - Rotates on hover, clearly hollow */}
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M19.7 12.3L12.3 12.3L12.3 19.7L19.7 19.7L19.7 12.3ZM18 14L18 18L14 18L14 14L18 14Z"
        fill="currentColor"
        className="transition-transform duration-500 origin-center group-hover:rotate-45"
      ></path>

      {/* Outer Brackets - Move outward on hover */}
      <path
        id="outer-path-1"
        d="M-0.007813 11.3173L0.199083 11.5242C2.67484 14 2.67484 18.014 0.199084 20.4898L-0.00781259 20.6966L2.06115 22.7656L2.26805 22.5587C5.88647 18.9403 5.88647 13.0737 2.26805 9.45522L2.06115 9.24832L-0.007813 11.3173Z"
        fill="currentColor"
        className="transition-transform duration-500 group-hover:-translate-x-1"
      ></path>
      <path
        id="outer-path-2"
        d="M31.7867 20.4898L31.9936 20.6966L29.9246 22.7656L29.7177 22.5587C26.0993 18.9403 26.0993 13.0737 29.7177 9.45522L29.9246 9.24832L31.9936 11.3173L31.7867 11.5242C29.3109 14 29.3109 18.014 31.7867 20.4898Z"
        fill="currentColor"
        className="transition-transform duration-500 group-hover:translate-x-1"
      ></path>
      <path
        id="outer-path-3"
        d="M11.3033 0.00639859L11.5102 0.213294C13.986 2.68907 18 2.68907 20.4758 0.213294L20.6827 0.00640008L22.7516 2.07537L22.5447 2.28227C18.9263 5.9007 13.0597 5.9007 9.44127 2.28227L9.23437 2.07537L11.3033 0.00639859Z"
        fill="currentColor"
        className="transition-transform duration-500 group-hover:-translate-y-1"
      ></path>
      <path
        id="outer-path-4"
        d="M20.6827 32.0078L20.4758 31.8009C18 29.3251 13.986 29.3251 11.5102 31.8009L11.3033 32.0078L9.23437 29.9388L9.44127 29.7319C13.0597 26.1135 18.9263 26.1135 22.5447 29.7319L22.7516 29.9388L20.6827 32.0078Z"
        fill="currentColor"
        className="transition-transform duration-500 group-hover:translate-y-1"
      ></path>
    </svg>
  )
}
