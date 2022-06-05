import { builder } from '../../builder';
import { GraphQLYogaError } from '@graphql-yoga/node';
import { RegistrationMode } from '../../generated/prisma';
import { RegistrationService } from '../../helpers/registrationService';
import prisma from '../../client';

builder.mutationFields((t) => ({
  useRegistrationCode: t.prismaField({
    type: 'EventRegistrationCode',
    args: {
      id: t.arg.id({ required: true }),
      price: t.arg({ type: 'JSON' }),
    },
    resolve: async (query, root, { id, price }, context) => {
      const registrationCode = await prisma.eventRegistrationCode.findUnique({
        where: { id },
        include: { targetEvent: true },
      });
      if (!registrationCode) {
        throw new GraphQLYogaError(
          'Registration code could not be found for: ' + id
        );
      }
      if (
        registrationCode.targetEvent.registrationMode ===
        RegistrationMode.STRIPE
      ) {
        const priceAllowed = !!price;
        if (!priceAllowed) {
          throw new GraphQLYogaError(
            'Price received is not valid in this context'
          );
        }
      }
      const baseUrl = process.env.DEV
        ? 'http://localhost:4200/profile'
        : 'https://tumi.esn.world/profile';
      return RegistrationService.registerWithCode(
        context,
        id,
        context.user?.id ?? '',
        price,
        `${baseUrl}?cancel=true&code=${id}`,
        `${baseUrl}?success=true&code=${id}`
      );
    },
  }),
}));
