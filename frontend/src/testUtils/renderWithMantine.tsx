import React from 'react';
import { render } from '@testing-library/react';
import type { RenderOptions } from '@testing-library/react';

interface MantineRenderOptions extends Omit<RenderOptions, 'queries'> {
	mantineProps?: Record<string, any>;
}

// Uniwersalny helper renderujący z MantineProvider (dynamiczny import zgodny z CJS/ESM)
export const renderWithMantine = (ui: React.ReactElement, options: MantineRenderOptions = {}) => {
	// eslint-disable-next-line @typescript-eslint/no-var-requires
	const MantineCore = require('@mantine/core');
	const Provider =
		MantineCore.MantineProvider ||
		MantineCore.default?.MantineProvider ||
		MantineCore.default ||
		(({ children }: { children: React.ReactNode }) => <>{children}</>);

	return render(<Provider {...options.mantineProps}>{ui}</Provider>, options);
};

export default renderWithMantine;
