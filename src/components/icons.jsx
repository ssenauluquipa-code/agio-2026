import {
  ArrowsClockwise,
  MagnifyingGlass,
  PaperPlaneTilt,
  ListChecks,
  Check,
  ArrowCounterClockwise,
  Warning,
  CloudCheck,
} from '@phosphor-icons/react';
import { SiWhatsapp } from 'react-icons/si';

const defaultProps = {
  size: 18,
  weight: 'bold',
  color: 'currentColor',
  'aria-hidden': 'true',
};

export const IconActualizar = (props) => <ArrowsClockwise {...defaultProps} {...props} />;
export const IconBusqueda = (props) => <MagnifyingGlass {...defaultProps} {...props} />;
export const IconAvisos = (props) => <PaperPlaneTilt {...defaultProps} {...props} />;
export const IconAsistencia = (props) => <ListChecks {...defaultProps} {...props} />;
export const IconCheck = (props) => <Check {...defaultProps} {...props} />;
export const IconDeshacer = (props) => <ArrowCounterClockwise {...defaultProps} {...props} />;
export const IconWarning = (props) => <Warning {...defaultProps} {...props} />;
export const IconCloudCheck = (props) => <CloudCheck {...defaultProps} {...props} />;
export const IconWhatsApp = (props) => <SiWhatsapp size={props.size || 18} color={props.color || 'currentColor'} aria-hidden="true" {...props} />;

export {
  ArrowsClockwise,
  MagnifyingGlass,
  PaperPlaneTilt,
  ListChecks,
  Check,
  ArrowCounterClockwise,
  Warning,
  CloudCheck,
  SiWhatsapp,
};
